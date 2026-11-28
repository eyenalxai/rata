import type { CacheSeed } from "@test/database-harness"
import type { FakeLabel, FakeTeam, FakeTeamMember, FakeTeamState } from "@test/fake-linear/model"

import { apiLayer, makeFakeLinear } from "@test/fake-linear"
import { defaultPriorities, defaultViewer } from "@test/fake-linear/model"
import { fakeTerminal } from "@test/terminal-harness"
import { describe, expect, test } from "bun:test"
import { Clock, Effect, FileSystem, Layer, Option, Path, Schema, Terminal } from "effect"

import type { StateType } from "@/domain/workflow-state"

import { LinkService } from "@/config/link"
import { currentDirectory, RepoConfigService } from "@/config/repo"
import { hashApiKey } from "@/context/key-hash"
import { ContextResolver } from "@/context/resolve"
import { teamId } from "@/domain/id"
import { TeamDetail } from "@/linear/decode/team"
import { Viewer } from "@/linear/decode/viewer"
import { contextCacheTtlMillis } from "@/local/context-cache"

const teamUuid = "0f8fad5b-d9cb-469f-a165-70867728950e"

const states: readonly (Omit<FakeTeamState, "type"> & { readonly type: StateType })[] = [
  { id: "state-todo", name: "Todo", type: "unstarted", position: 1 },
  { id: "state-progress", name: "In Progress", type: "started", position: 2 },
  { id: "state-done", name: "Done", type: "completed", position: 3 },
]

const members: readonly FakeTeamMember[] = [
  {
    id: defaultViewer.id,
    name: defaultViewer.name,
    displayName: defaultViewer.displayName,
    email: defaultViewer.email,
    active: true,
  },
]

const labels: readonly FakeLabel[] = [
  { id: "label-bug", name: "bug", color: "#EB5757", teamId: teamUuid },
  { id: "label-enhancement", name: "enhancement", color: "#5E6AD2", teamId: teamUuid },
]

const team: FakeTeam = {
  id: teamUuid,
  key: "RAT",
  name: "Rata",
  timezone: "America/Los_Angeles",
  states,
  members,
}

const detail: TeamDetail = Option.getOrThrow(
  Schema.decodeOption(TeamDetail)({
    id: team.id,
    key: team.key,
    name: team.name,
    timezone: team.timezone,
    states,
    labels: labels.map((label): { id: string; name: string; color: string; scope: "team" } => ({
      id: label.id,
      name: label.name,
      color: label.color,
      scope: "team",
    })),
    members: members.map(({ id, name, displayName, email }) => ({
      id,
      name,
      displayName,
      email,
    })),
    priorities: [...defaultPriorities],
  }),
)

const viewer = Option.getOrThrow(Schema.decodeOption(Viewer)(defaultViewer))

const seed = { teams: [team], labels }

const repository = [{ key: process.cwd(), teamId: team.id }]

const keyHash = hashApiKey("test-key")

const now = (): Promise<number> => Effect.runPromise(Clock.currentTimeMillis)

const warmCache = async (overrides: {
  readonly keyHash?: string
  readonly detail?: TeamDetail
  readonly fetchedAt?: number
}): Promise<CacheSeed> => {
  const hash = overrides.keyHash ?? keyHash
  const fetchedAt = overrides.fetchedAt ?? (await now())
  return {
    teams: [
      {
        profile: "env",
        teamId: team.id,
        keyHash: hash,
        detail: overrides.detail ?? detail,
        fetchedAt,
      },
    ],
    viewers: [{ profile: "env", keyHash: hash, viewer, fetchedAt }],
  }
}

describe("ContextResolver resolution", () => {
  test("reads once on a miss and then serves the cache", async () => {
    const fake = makeFakeLinear(seed)
    const result = await Effect.gen(function* readTwice() {
      const context = yield* ContextResolver
      const first = yield* context.resolve({})
      const afterFirst = fake.requests.length
      const second = yield* context.resolve({})
      return { first, second, afterFirst, afterSecond: fake.requests.length }
    }).pipe(Effect.provide(apiLayer(fake.handler, { repositories: repository })), Effect.runPromise)

    expect(result.afterFirst).toBeGreaterThan(0)
    expect(result.afterSecond).toBe(result.afterFirst)
    expect(result.first.team?.detail.states).toHaveLength(3)
    expect(result.second.team?.detail.id).toBe(detail.id)
    expect(result.second.team?.ageSeconds).toBe(0)
  })

  test("refreshes when the cache is older than seven days", async () => {
    const fake = makeFakeLinear(seed)
    const fetchedAt = await now()
    const stale = await warmCache({ fetchedAt: fetchedAt - contextCacheTtlMillis - 1000 })
    const result = await Effect.gen(function* readExpired() {
      const context = yield* ContextResolver
      return yield* context.resolve({})
    }).pipe(
      Effect.provide(apiLayer(fake.handler, { repositories: repository, cache: stale })),
      Effect.runPromise,
    )

    expect(fake.requests.length).toBeGreaterThan(0)
    expect(result.team?.detail.key).toBe(team.key)
  })

  test("refreshes when the API key changed", async () => {
    const fake = makeFakeLinear(seed)
    const oldCache = await warmCache({ keyHash: hashApiKey("old-key") })
    const result = await Effect.gen(function* readWithNewKey() {
      const context = yield* ContextResolver
      const first = yield* context.resolve({})
      const afterFirst = fake.requests.length
      const second = yield* context.resolve({})
      return { first, second, afterFirst, afterSecond: fake.requests.length }
    }).pipe(
      Effect.provide(
        apiLayer(fake.handler, {
          env: { HOME: "/home/test", LINEAR_API_KEY: "new-key" },
          repositories: repository,
          cache: oldCache,
        }),
      ),
      Effect.runPromise,
    )

    expect(result.afterFirst).toBeGreaterThan(0)
    expect(result.afterSecond).toBe(result.afterFirst)
    expect(result.second.team?.detail.key).toBe(team.key)
  })

  test("treats another profile as a cache miss", async () => {
    const fake = makeFakeLinear(seed)
    const result = await Effect.gen(function* readWithProfile() {
      const context = yield* ContextResolver
      return yield* context.resolve({})
    }).pipe(
      Effect.provide(
        apiLayer(fake.handler, {
          env: { HOME: "/home/test" },
          profiles: [{ name: "default", apiKey: "test-key", isDefault: true }],
          repositories: repository,
          cache: await warmCache({}),
        }),
      ),
      Effect.runPromise,
    )

    expect(fake.requests.length).toBeGreaterThan(0)
    expect(result.team?.detail.id).toBe(detail.id)
  })

  test("falls back to the key and repairs a stale stored UUID", async () => {
    const fake = makeFakeLinear(seed)
    const staleUuid = "11111111-1111-1111-1111-111111111111"
    const result = await Effect.gen(function* readStaleId() {
      const context = yield* ContextResolver
      const repoConfig = yield* RepoConfigService
      const resolved = yield* context.resolve({})
      const stored = yield* repoConfig.read(yield* currentDirectory)
      return { resolved, stored }
    }).pipe(
      Effect.provide(
        apiLayer(fake.handler, {
          repositories: [{ key: process.cwd(), team: "RAT", teamId: staleUuid }],
        }),
      ),
      Effect.runPromise,
    )

    expect(fake.requests.length).toBeGreaterThan(0)
    expect(result.resolved.team?.detail.id).toBe(detail.id)
    expect(result.resolved.warning).toBe(
      `The stored team id ${staleUuid} is stale. Repaired the link to RAT.`,
    )
    expect(result.stored).toEqual(Option.some({ team: "RAT", teamId: teamId(teamUuid) }))
  })

  test("keeps a linked key when the warm cache holds an older key", async () => {
    const fake = makeFakeLinear(seed)
    const olderDetail = Option.getOrThrow(
      Schema.decodeOption(TeamDetail)({
        ...detail,
        key: "OLD",
      }),
    )
    const result = await Effect.gen(function* readWarmRepair() {
      const context = yield* ContextResolver
      const repoConfig = yield* RepoConfigService
      const resolved = yield* context.resolve({})
      const stored = yield* repoConfig.read(yield* currentDirectory)
      return { resolved, stored }
    }).pipe(
      Effect.provide(
        apiLayer(fake.handler, {
          repositories: [{ key: process.cwd(), team: "RAT", teamId: teamUuid }],
          cache: await warmCache({ detail: olderDetail }),
        }),
      ),
      Effect.runPromise,
    )

    expect(result.stored).toEqual(Option.some({ team: "RAT", teamId: teamId(teamUuid) }))
    expect(result.resolved.warning).toBeNull()
  })

  test("keeps a re-linked key after a warm cache read", async () => {
    const fake = makeFakeLinear(seed)
    const olderDetail = Option.getOrThrow(
      Schema.decodeOption(TeamDetail)({
        ...detail,
        key: "OLD",
      }),
    )
    const result = await Effect.gen(function* relink() {
      const link = yield* LinkService
      const context = yield* ContextResolver
      const repoConfig = yield* RepoConfigService
      yield* link.link({
        team: Option.some("RAT"),
        project: Option.none(),
        workspace: Option.none(),
        create: false,
        name: Option.none(),
        timezone: Option.none(),
      })
      const afterLink = yield* repoConfig.read(yield* currentDirectory)
      const resolved = yield* context.resolve({})
      const afterRead = yield* repoConfig.read(yield* currentDirectory)
      return { afterLink, afterRead, resolved }
    }).pipe(
      Effect.provide(
        Layer.mergeAll(
          apiLayer(fake.handler, {
            repositories: [{ key: process.cwd(), team: "OLD", teamId: teamUuid }],
            cache: await warmCache({ detail: olderDetail }),
          }),
          FileSystem.layerNoop({}),
          Path.layer,
        ),
      ),
      Effect.provideService(Terminal.Terminal, fakeTerminal([])),
      Effect.runPromise,
    )

    expect(result.afterLink).toEqual(Option.some({ team: "RAT", teamId: teamId(teamUuid) }))
    expect(result.afterRead).toEqual(Option.some({ team: "RAT", teamId: teamId(teamUuid) }))
    expect(result.resolved.team?.detail.key).toBe("RAT")
  })

  test("treats a cached team with a corrupt id as a miss", async () => {
    const fake = makeFakeLinear(seed)
    const corruptDetail = Option.getOrThrow(
      Schema.decodeOption(TeamDetail)({
        ...detail,
        id: "corrupt-id",
      }),
    )
    const result = await Effect.gen(function* readCorruptCache() {
      const context = yield* ContextResolver
      const repoConfig = yield* RepoConfigService
      const resolved = yield* context.resolve({})
      const stored = yield* repoConfig.read(yield* currentDirectory)
      return { resolved, stored }
    }).pipe(
      Effect.provide(
        apiLayer(fake.handler, {
          repositories: [{ key: process.cwd(), team: "RAT", teamId: teamUuid }],
          cache: await warmCache({ detail: corruptDetail }),
        }),
      ),
      Effect.runPromise,
    )

    expect(fake.requests.length).toBeGreaterThan(0)
    expect(result.stored).toEqual(Option.some({ team: "RAT", teamId: teamId(teamUuid) }))
    expect(result.resolved.team?.detail.key).toBe("RAT")
  })

  test("invalidates the env profile when a workspace is linked", async () => {
    const fake = makeFakeLinear(seed)
    const olderDetail = Option.getOrThrow(
      Schema.decodeOption(TeamDetail)({
        ...detail,
        key: "OLD",
      }),
    )
    const fetchedAt = await now()
    const result = await Effect.gen(function* relinkInWorkspace() {
      const link = yield* LinkService
      const context = yield* ContextResolver
      const repoConfig = yield* RepoConfigService
      yield* link.link({
        team: Option.some("RAT"),
        project: Option.none(),
        workspace: Option.some("work"),
        create: false,
        name: Option.none(),
        timezone: Option.none(),
      })
      const resolved = yield* context.resolve({})
      const stored = yield* repoConfig.read(yield* currentDirectory)
      return { resolved, stored }
    }).pipe(
      Effect.provide(
        Layer.mergeAll(
          apiLayer(fake.handler, {
            env: { HOME: "/home/test", LINEAR_API_KEY: "test-key" },
            profiles: [{ name: "work", apiKey: "work-key", isDefault: true }],
            repositories: [
              { key: process.cwd(), team: "OLD", teamId: teamUuid, workspace: "work" },
            ],
            cache: {
              teams: [
                {
                  profile: "env",
                  teamId: teamUuid,
                  keyHash: hashApiKey("test-key"),
                  detail: olderDetail,
                  fetchedAt,
                },
                {
                  profile: "work",
                  teamId: teamUuid,
                  keyHash: hashApiKey("work-key"),
                  detail: olderDetail,
                  fetchedAt,
                },
              ],
            },
          }),
          FileSystem.layerNoop({}),
          Path.layer,
        ),
      ),
      Effect.provideService(Terminal.Terminal, fakeTerminal([])),
      Effect.runPromise,
    )

    expect(result.stored).toEqual(
      Option.some({ team: "RAT", teamId: teamId(teamUuid), workspace: "work" }),
    )
    expect(result.resolved.team?.detail.key).toBe("RAT")
  })

  test("uses the team UUID stored by link", async () => {
    const fake = makeFakeLinear(seed)
    const result = await Effect.gen(function* readWarm() {
      const context = yield* ContextResolver
      return yield* context.resolve({})
    }).pipe(
      Effect.provide(
        apiLayer(fake.handler, { repositories: repository, cache: await warmCache({}) }),
      ),
      Effect.runPromise,
    )

    expect(fake.requests).toHaveLength(0)
    expect(result.team?.detail.id).toBe(detail.id)
    expect(result.team?.detail.key).toBe(team.key)
  })
})
