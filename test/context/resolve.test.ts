import type { CacheSeed, RepositorySeed } from "@test/database-harness"
import type { MemorySeed, MemoryTeam } from "@test/fake-linear/gateway/model"

import { countingGateway } from "@test/fake-linear/gateway/counting"
import { memoryApiLayer } from "@test/fake-linear/memory-layer"
import { defaultPriorities, defaultViewer } from "@test/fake-linear/model"
import { describe, expect, test } from "bun:test"
import { Clock, Effect, Option, Schema } from "effect"

import { hashApiKey } from "@/context/key-hash"
import { ContextResolver } from "@/context/resolve"
import { labelId, teamId, workflowStateId } from "@/domain/id"
import { TeamDetail } from "@/linear/decode/team"
import { Viewer } from "@/linear/decode/viewer"

const viewer = Option.getOrThrow(Schema.decodeOption(Viewer)(defaultViewer))

const team: MemoryTeam = {
  id: teamId("team-1"),
  key: "RAT",
  name: "Rata",
  timezone: "America/Los_Angeles",
  states: [
    { id: workflowStateId("s-todo"), name: "Todo", type: "unstarted", position: 1 },
    { id: workflowStateId("s-done"), name: "Done", type: "completed", position: 2 },
  ],
  labels: [
    { id: labelId("l1"), name: "ready-for-agent", color: "#111111", scope: "team" },
    { id: labelId("l2"), name: "bug", color: "#EB5757", scope: "workspace" },
  ],
  members: [
    {
      id: viewer.id,
      name: viewer.name,
      displayName: viewer.displayName,
      email: viewer.email,
      active: true,
    },
  ],
  priorities: [...defaultPriorities],
}

const otherTeam: MemoryTeam = {
  id: teamId("team-2"),
  key: "OPS",
  name: "Operations",
  timezone: "America/New_York",
  states: [],
  labels: [],
  members: [],
  priorities: [...defaultPriorities],
}

const seed: MemorySeed = {
  viewer,
  teams: [team, otherTeam],
  labels: [],
}

const repositories: readonly RepositorySeed[] = [
  {
    key: process.cwd(),
    team: "RAT",
    teamId: "team-1",
    project: "Tracker",
    defaultAssignee: "me",
    defaultLabels: ["ready-for-agent"],
    defaultPriority: 3,
  },
]

const env = { HOME: "/home/test", LINEAR_API_KEY: "test-key" }

describe("ResolvedContext", () => {
  test("resolves the root, profile, viewer, team, states, labels and defaults", async () => {
    const counting = countingGateway(seed)
    const context = await Effect.gen(function* resolveContext() {
      const resolver = yield* ContextResolver
      return yield* resolver.resolve({})
    }).pipe(
      Effect.provide(memoryApiLayer(seed, { env, gateway: counting.gateway, repositories })),
      Effect.runPromise,
    )

    expect(context.root.length).toBeGreaterThan(0)
    expect(context.profile).toBeNull()
    expect(context.keySource).toBe("env")
    expect(context.viewer).toEqual(viewer)
    expect(context.team?.identity).toMatchObject({ id: "team-1", key: "RAT", name: "Rata" })
    expect(context.states.map((state) => state.name)).toEqual(["Todo", "Done"])
    expect(context.labels.map((label) => label.name)).toEqual(["ready-for-agent", "bug"])
    expect(context.defaults).toEqual({
      assignee: "me",
      labels: ["ready-for-agent"],
      priority: "medium",
    })
    expect(context.project).toBe("Tracker")
    expect(context.storedTeam).toBe("RAT")
    expect(context.warning).toBeNull()
    expect(counting.counts.viewer()).toBe(1)
    expect(counting.counts.details()).toBe(1)
  })

  test("returns the same value on the second resolve", async () => {
    const counting = countingGateway(seed)
    const result = await Effect.gen(function* resolveTwice() {
      const resolver = yield* ContextResolver
      const first = yield* resolver.resolve({})
      const second = yield* resolver.resolve({})
      return { first, second }
    }).pipe(
      Effect.provide(memoryApiLayer(seed, { env, gateway: counting.gateway, repositories })),
      Effect.runPromise,
    )

    expect(result.second).toBe(result.first)
    expect(counting.counts.viewer()).toBe(1)
    expect(counting.counts.details()).toBe(1)
    expect(counting.counts.byId()).toBe(1)
  })

  test("reads Linear again when refresh is set", async () => {
    const counting = countingGateway(seed)
    await Effect.gen(function* refreshContext() {
      const resolver = yield* ContextResolver
      yield* resolver.resolve({})
      counting.counts.reset()
      return yield* resolver.resolve({ refresh: true })
    }).pipe(
      Effect.provide(memoryApiLayer(seed, { env, gateway: counting.gateway, repositories })),
      Effect.runPromise,
    )

    expect(counting.counts.viewer()).toBe(1)
    expect(counting.counts.details()).toBe(1)
  })

  test("resolves an explicit team instead of the linked team", async () => {
    const counting = countingGateway(seed)
    const context = await Effect.gen(function* resolveOtherTeam() {
      const resolver = yield* ContextResolver
      return yield* resolver.resolve({ team: "OPS" })
    }).pipe(
      Effect.provide(memoryApiLayer(seed, { env, gateway: counting.gateway, repositories })),
      Effect.runPromise,
    )

    expect(String(context.team?.identity.id)).toBe("team-2")
    expect(context.states).toEqual([])
    expect(counting.counts.byKey()).toBe(1)
  })

  test("fails when a team is required and the repository has no link", async () => {
    const counting = countingGateway(seed)
    const error = await Effect.gen(function* requireTeam() {
      const resolver = yield* ContextResolver
      return yield* Effect.flip(resolver.resolve({ requireTeam: true }))
    }).pipe(
      Effect.provide(memoryApiLayer(seed, { env, gateway: counting.gateway, repositories: [] })),
      Effect.runPromise,
    )

    expect(error._tag).toBe("TeamResolutionError")
    if (error._tag === "TeamResolutionError") {
      expect(error.message).toBe("No team. Pass --team, or run `rata link`.")
    }
  })

  test("serves a warm team and viewer cache without a gateway read", async () => {
    const counting = countingGateway(seed)
    const keyHash = hashApiKey("test-key")
    const fetchedAt = await Effect.runPromise(Clock.currentTimeMillis)
    const detail = Option.getOrThrow(
      Schema.decodeOption(TeamDetail)({
        id: team.id,
        key: team.key,
        name: team.name,
        timezone: team.timezone,
        states: team.states ?? [],
        labels: team.labels ?? [],
        members: (team.members ?? []).map(({ id, name, displayName, email }) => ({
          id,
          name,
          displayName,
          email,
        })),
        priorities: team.priorities ?? [],
      }),
    )
    const cache: CacheSeed = {
      teams: [{ profile: "env", teamId: "team-1", keyHash, detail, fetchedAt }],
      viewers: [
        {
          profile: "env",
          keyHash,
          viewer,
          fetchedAt,
        },
      ],
    }
    const context = await Effect.gen(function* resolveWarm() {
      const resolver = yield* ContextResolver
      return yield* resolver.resolve({})
    }).pipe(
      Effect.provide(memoryApiLayer(seed, { cache, env, gateway: counting.gateway, repositories })),
      Effect.runPromise,
    )

    expect(String(context.team?.identity.id)).toBe("team-1")
    expect(counting.counts.viewer()).toBe(0)
    expect(counting.counts.details()).toBe(0)
  })
})
