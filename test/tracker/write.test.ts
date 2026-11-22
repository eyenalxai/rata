import type { MemorySeed, MemoryTeam } from "@test/fake-linear/gateway/model"

import { countingGateway } from "@test/fake-linear/gateway/counting"
import { memoryApiLayer } from "@test/fake-linear/memory-layer"
import { defaultPriorities, defaultViewer } from "@test/fake-linear/model"
import { summaryNode } from "@test/issue-fixtures"
import { describe, expect, test } from "bun:test"
import { Effect, Option, Schema } from "effect"

import { ContextResolver } from "@/context/resolve"
import { labelId, teamId, workflowStateId } from "@/domain/id"
import { IssueSummaryNode } from "@/linear/decode/issue"
import { Viewer } from "@/linear/decode/viewer"
import { IssueWriter } from "@/tracker/write"

const viewer = Option.getOrThrow(Schema.decodeOption(Viewer)(defaultViewer))

const team: MemoryTeam = {
  id: teamId("team-1"),
  key: "RAT",
  name: "Rata",
  timezone: "America/Los_Angeles",
  states: [{ id: workflowStateId("s-todo"), name: "Todo", type: "unstarted", position: 1 }],
  labels: [
    { id: labelId("l1"), name: "ready-for-agent", color: "#111111", scope: "team" },
    { id: labelId("l2"), name: "bug", color: "#EB5757", scope: "workspace" },
  ],
  members: [],
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
        Schema.decodeUnknownOption(IssueSummaryNode)({
          ...summaryNode("RAT-1"),
          assignee: null,
        }),
      ),
      description: null,
      team: { id: team.id, key: team.key, name: team.name },
    },
  ],
}

const repositories = [
  {
    key: process.cwd(),
    team: "RAT",
    teamId: "team-1",
    defaultAssignee: "me",
    defaultLabels: ["ready-for-agent"],
    defaultPriority: 3,
  },
]
const env = { HOME: "/home/test", LINEAR_API_KEY: "test-key" }

describe("IssueWriter context", () => {
  test("plans a create from the context defaults and team", async () => {
    const plan = await Effect.gen(function* planCreate() {
      const resolver = yield* ContextResolver
      const writer = yield* IssueWriter
      const context = yield* resolver.resolve({ requireTeam: true })
      return yield* writer.planCreate(context, { title: "Fix login" })
    }).pipe(Effect.provide(memoryApiLayer(seed, { env, repositories })), Effect.runPromise)

    expect(plan).toEqual({
      team: "RAT",
      title: "Fix login",
      labels: ["ready-for-agent"],
      assignee: "me",
      priority: "medium",
    })
  })

  test("keeps the stored team text in a create dry run", async () => {
    const plan = await Effect.gen(function* planStaleTeam() {
      const resolver = yield* ContextResolver
      const writer = yield* IssueWriter
      const context = yield* resolver.resolve({ requireTeam: true })
      return yield* writer.planCreate(context, { title: "Fix login" })
    }).pipe(
      Effect.provide(
        memoryApiLayer(seed, {
          env,
          repositories: [
            {
              key: process.cwd(),
              team: "OLD",
              teamId: "team-1",
              defaultAssignee: "me",
              defaultLabels: ["ready-for-agent"],
              defaultPriority: 3,
            },
          ],
        }),
      ),
      Effect.runPromise,
    )

    expect(plan.team).toBe("OLD")
  })

  test("runs a non-create write against the in-memory gateway", async () => {
    const counting = countingGateway(seed)
    const result = await Effect.gen(function* assignIssue() {
      const resolver = yield* ContextResolver
      const writer = yield* IssueWriter
      const context = yield* resolver.resolve({})
      return yield* writer.assign(context, "RAT-1", "me", { dryRun: true })
    }).pipe(
      Effect.provide(memoryApiLayer(seed, { env, gateway: counting.gateway, repositories })),
      Effect.runPromise,
    )

    expect(result.status).toBe("updated")
    expect(result.actions).toEqual([
      {
        action: "assign",
        target: "RAT-1",
        status: "updated",
        changes: { assignee: "me" },
      },
    ])
    expect(counting.counts.viewer()).toBe(1)
    expect(counting.counts.details()).toBe(1)
  })
})
