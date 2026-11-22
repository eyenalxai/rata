import type { CacheSeed } from "@test/database-harness"
import type { MemorySeed, MemoryTeam } from "@test/fake-linear/gateway/model"

import { countingGateway } from "@test/fake-linear/gateway/counting"
import { memoryApiLayer } from "@test/fake-linear/memory-layer"
import { defaultPriorities, defaultViewer } from "@test/fake-linear/model"
import { summaryNode } from "@test/issue-fixtures"
import { describe, expect, test } from "bun:test"
import { Clock, Effect, Option, Schema } from "effect"

import { hashApiKey } from "@/context/key-hash"
import { ContextResolver } from "@/context/resolve"
import { issueId, labelId, teamId, userId, workflowStateId } from "@/domain/id"
import { IssueSummaryNode } from "@/linear/decode/issue"
import { TeamDetail } from "@/linear/decode/team"
import { Viewer } from "@/linear/decode/viewer"
import { LinearGateway } from "@/linear/gateway"
import {
  requireTeamId,
  resolveAssigneeId,
  resolveIssueRef,
  resolveLabelName,
  resolveStateName,
} from "@/tracker/resolve"

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
      id: userId("5f0c1f2a-3b4c-4d5e-8f90-1234567890ab"),
      name: "Ada",
      displayName: "ada",
      email: "ada@example.com",
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
  issues: [
    {
      summary: Option.getOrThrow(
        Schema.decodeUnknownOption(IssueSummaryNode)(summaryNode("RAT-1")),
      ),
      description: null,
      team: { id: team.id, key: team.key, name: team.name },
    },
  ],
}

const repositories = [{ key: process.cwd(), team: "RAT", teamId: "team-1" }]
const env = { HOME: "/home/test", LINEAR_API_KEY: "test-key" }

const withLayer = <A, E>(
  counting: ReturnType<typeof countingGateway>,
  effect: Effect.Effect<A, E, ContextResolver | LinearGateway>,
) =>
  effect.pipe(
    Effect.provide(memoryApiLayer(seed, { env, gateway: counting.gateway, repositories })),
    Effect.runPromise,
  )

describe("tracker ref resolution", () => {
  test("resolves an identifier, a UUID and a Linear URL to the issue id", async () => {
    const counting = countingGateway(seed)
    const result = await withLayer(
      counting,
      Effect.gen(function* resolveRefs() {
        const gateway = yield* LinearGateway
        const identifier = yield* resolveIssueRef(gateway, "RAT-1")
        const uuid = yield* resolveIssueRef(gateway, "5f0c1f2a-3b4c-4d5e-8f90-1234567890ab")
        const url = yield* resolveIssueRef(gateway, "https://linear.app/utbetdix/issue/RAT-1/title")
        return { identifier, url, uuid }
      }),
    )

    expect(String(result.identifier.ref)).toBe("RAT-1")
    expect(result.identifier.id).toBe(issueId("id-RAT-1"))
    expect(String(result.url.ref)).toBe("RAT-1")
    expect(result.url.id).toBe(issueId("id-RAT-1"))
    expect(String(result.uuid.ref)).toBe("5f0c1f2a-3b4c-4d5e-8f90-1234567890ab")
    expect(result.uuid.id).toBe(issueId("5f0c1f2a-3b4c-4d5e-8f90-1234567890ab"))
  })

  test("uses the context team and never re-resolves the link", async () => {
    const counting = countingGateway(seed)
    const result = await withLayer(
      counting,
      Effect.gen(function* resolveTeam() {
        const resolver = yield* ContextResolver
        const context = yield* resolver.resolve({})
        return yield* requireTeamId(context)
      }),
    )

    expect(result).toBe(teamId("team-1"))
    expect(counting.counts.byId()).toBe(1)
    expect(counting.counts.byKey()).toBe(0)
  })

  test("fails with not_found when the linked team is gone", async () => {
    const counting = countingGateway(seed)
    const error = await Effect.gen(function* resolveMissingTeam() {
      const resolver = yield* ContextResolver
      const context = yield* resolver.resolve({})
      return yield* Effect.flip(requireTeamId(context))
    }).pipe(
      Effect.provide(
        memoryApiLayer(seed, {
          env,
          gateway: counting.gateway,
          repositories: [{ key: process.cwd(), team: "GONE" }],
        }),
      ),
      Effect.runPromise,
    )

    expect(error._tag).toBe("TeamNotFoundError")
    if (error._tag === "TeamNotFoundError") {
      expect(error.key).toBe("GONE")
    }
  })

  test("resolves me and a user UUID as an assignee", async () => {
    const counting = countingGateway(seed)
    const result = await withLayer(
      counting,
      Effect.gen(function* resolveAssignees() {
        const resolver = yield* ContextResolver
        const gateway = yield* LinearGateway
        const context = yield* resolver.resolve({})
        const me = yield* resolveAssigneeId(gateway, context, "me")
        const uuid = yield* resolveAssigneeId(
          gateway,
          context,
          "5f0c1f2a-3b4c-4d5e-8f90-1234567890ab",
        )
        return { me, uuid }
      }),
    )

    expect(result.me).toBe(viewer.id)
    expect(result.uuid).toBe(userId("5f0c1f2a-3b4c-4d5e-8f90-1234567890ab"))
  })

  test("rejects an assignee that is not me or a user UUID", async () => {
    const counting = countingGateway(seed)
    const error = await withLayer(
      counting,
      Effect.gen(function* resolveAssignee() {
        const resolver = yield* ContextResolver
        const gateway = yield* LinearGateway
        const context = yield* resolver.resolve({})
        return yield* Effect.flip(resolveAssigneeId(gateway, context, "ada"))
      }),
    )

    expect(error._tag).toBe("AssigneeInputError")
  })

  test("resolves a state name case-insensitively and refreshes once", async () => {
    const counting = countingGateway(seed)
    const result = await withLayer(
      counting,
      Effect.gen(function* resolveState() {
        const resolver = yield* ContextResolver
        const context = yield* resolver.resolve({})
        return yield* resolveStateName(resolver, context, "todo")
      }),
    )

    expect(result.name).toBe("Todo")
    expect(counting.counts.details()).toBe(1)
  })

  test("refreshes a warm cache once when the state is missing", async () => {
    const counting = countingGateway(seed)
    const keyHash = hashApiKey("test-key")
    const fetchedAt = await Effect.runPromise(Clock.currentTimeMillis)
    const cache: CacheSeed = {
      teams: [
        {
          profile: "env",
          teamId: "team-1",
          keyHash,
          fetchedAt,
          detail: Option.getOrThrow(
            Schema.decodeOption(TeamDetail)({
              id: team.id,
              key: team.key,
              name: team.name,
              timezone: team.timezone,
              states: (team.states ?? []).filter((state) => state.name === "Done"),
              labels: [],
              members: [],
              priorities: team.priorities ?? [],
            }),
          ),
        },
      ],
      viewers: [{ profile: "env", keyHash, viewer, fetchedAt }],
    }
    const result = await Effect.gen(function* resolveCachedState() {
      const resolver = yield* ContextResolver
      const context = yield* resolver.resolve({})
      counting.counts.reset()
      return yield* resolveStateName(resolver, context, "Todo")
    }).pipe(
      Effect.provide(memoryApiLayer(seed, { cache, env, gateway: counting.gateway, repositories })),
      Effect.runPromise,
    )

    expect(result.name).toBe("Todo")
    expect(counting.counts.viewer()).toBe(0)
    expect(counting.counts.details()).toBe(1)
  })

  test("reports the valid state names after one refresh", async () => {
    const counting = countingGateway(seed)
    const result = await withLayer(
      counting,
      Effect.gen(function* resolveUnknownState() {
        const resolver = yield* ContextResolver
        const context = yield* resolver.resolve({})
        return yield* Effect.flip(resolveStateName(resolver, context, "Nope"))
      }),
    )

    expect(result._tag).toBe("ContextStateNotFoundError")
    if (result._tag === "ContextStateNotFoundError") {
      expect(result.valid).toEqual(["Todo", "Done"])
      expect(result.message).toContain("Valid states: Todo, Done.")
    }
    expect(counting.counts.details()).toBe(2)
  })

  test("resolves a label name case-insensitively and reports the valid labels", async () => {
    const counting = countingGateway(seed)
    const result = await withLayer(
      counting,
      Effect.gen(function* resolveLabels() {
        const resolver = yield* ContextResolver
        const context = yield* resolver.resolve({})
        const found = yield* resolveLabelName(resolver, context, "READY-FOR-AGENT")
        const error = yield* Effect.flip(resolveLabelName(resolver, context, "nope"))
        return { error, found }
      }),
    )

    expect(result.found.name).toBe("ready-for-agent")
    expect(result.error._tag).toBe("ContextLabelNotFoundError")
    if (result.error._tag === "ContextLabelNotFoundError") {
      expect(result.error.valid).toEqual(["ready-for-agent", "bug"])
    }
  })
})
