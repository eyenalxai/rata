import type { CacheSeed } from "@test/database-harness"
import type { FakeLabel, FakeTeam, FakeTeamMember, FakeTeamState } from "@test/fake-linear/model"

import { apiLayer, makeFakeLinear } from "@test/fake-linear"
import { defaultPriorities, defaultViewer } from "@test/fake-linear/model"
import { describe, expect, test } from "bun:test"
import { Clock, Effect, Option, Schema } from "effect"

import type { StateType } from "@/domain/workflow-state"

import { Viewer } from "@/api/client"
import { TeamDetail } from "@/api/team/details"
import { hashApiKey } from "@/context/key-hash"
import { TeamContext } from "@/context/team"
import { contextCacheTtlMillis } from "@/local/context-cache"

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
  { id: "label-bug", name: "bug", color: "#EB5757", teamId: "team-1" },
  { id: "label-enhancement", name: "enhancement", color: "#5E6AD2", teamId: "team-1" },
]

const team: FakeTeam = {
  id: "team-1",
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

describe("TeamContext resolution", () => {
  test("reads once on a miss and then serves the cache", async () => {
    const fake = makeFakeLinear(seed)
    const result = await Effect.gen(function* readTwice() {
      const context = yield* TeamContext
      const first = yield* context.resolve({ refresh: false })
      const afterFirst = fake.requests.length
      const second = yield* context.resolve({ refresh: false })
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
      const context = yield* TeamContext
      return yield* context.resolve({ refresh: false })
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
      const context = yield* TeamContext
      const first = yield* context.resolve({ refresh: false })
      const afterFirst = fake.requests.length
      const second = yield* context.resolve({ refresh: false })
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
      const context = yield* TeamContext
      return yield* context.resolve({ refresh: false })
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

  test("falls back to the key when the stored UUID is stale", async () => {
    const fake = makeFakeLinear(seed)
    const result = await Effect.gen(function* readStaleId() {
      const context = yield* TeamContext
      return yield* context.resolve({ refresh: false })
    }).pipe(
      Effect.provide(
        apiLayer(fake.handler, {
          repositories: [{ key: process.cwd(), team: "RAT", teamId: "gone-id" }],
        }),
      ),
      Effect.runPromise,
    )

    expect(fake.requests.length).toBeGreaterThan(0)
    expect(result.team?.detail.id).toBe(detail.id)
    expect(result.warning).toBe("The stored team id gone-id is stale. Repaired the link to RAT.")
  })

  test("uses the team UUID stored by link", async () => {
    const fake = makeFakeLinear(seed)
    const result = await Effect.gen(function* readWarm() {
      const context = yield* TeamContext
      return yield* context.resolve({ refresh: false })
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

describe("TeamContext name resolution", () => {
  test("refreshes once when a state is missing from the cache", async () => {
    const fake = makeFakeLinear(seed)
    const partial = await warmCache({
      detail: { ...detail, states: detail.states.filter((state) => state.name === "Done") },
    })
    const result = await Effect.gen(function* resolveTodo() {
      const context = yield* TeamContext
      return yield* context.resolveState("todo")
    }).pipe(
      Effect.provide(apiLayer(fake.handler, { repositories: repository, cache: partial })),
      Effect.runPromise,
    )

    expect(fake.requests.length).toBeGreaterThan(0)
    expect(result.name).toBe("Todo")
  })

  test("fails with the valid state names after one refresh", async () => {
    const fake = makeFakeLinear(seed)
    const result = await Effect.gen(function* resolveUnknown() {
      const context = yield* TeamContext
      return yield* Effect.flip(context.resolveState("Nope"))
    }).pipe(
      Effect.provide(
        apiLayer(fake.handler, { repositories: repository, cache: await warmCache({}) }),
      ),
      Effect.runPromise,
    )

    expect(fake.requests.length).toBeGreaterThan(0)
    expect(result._tag).toBe("ContextStateNotFoundError")
    if (result._tag === "ContextStateNotFoundError") {
      expect(result.message).toContain("Todo")
      expect(result.message).toContain("In Progress")
      expect(result.message).toContain("Done")
      expect(result.valid).toEqual(["Todo", "In Progress", "Done"])
    }
  })

  test("refreshes once when a label is missing from the cache", async () => {
    const fake = makeFakeLinear(seed)
    const partial = await warmCache({
      detail: { ...detail, labels: detail.labels.filter((label) => label.name === "bug") },
    })
    const result = await Effect.gen(function* resolveEnhancement() {
      const context = yield* TeamContext
      return yield* context.resolveLabel("Enhancement")
    }).pipe(
      Effect.provide(apiLayer(fake.handler, { repositories: repository, cache: partial })),
      Effect.runPromise,
    )

    expect(fake.requests.length).toBeGreaterThan(0)
    expect(result.name).toBe("enhancement")
  })

  test("fails with the valid label names after one refresh", async () => {
    const fake = makeFakeLinear(seed)
    const result = await Effect.gen(function* resolveUnknown() {
      const context = yield* TeamContext
      return yield* Effect.flip(context.resolveLabel("nope"))
    }).pipe(
      Effect.provide(
        apiLayer(fake.handler, { repositories: repository, cache: await warmCache({}) }),
      ),
      Effect.runPromise,
    )

    expect(result._tag).toBe("ContextLabelNotFoundError")
    if (result._tag === "ContextLabelNotFoundError") {
      expect(result.message).toContain("bug")
      expect(result.message).toContain("enhancement")
    }
  })
})
