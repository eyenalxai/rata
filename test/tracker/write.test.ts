import type { MemorySeed, MemoryTeam } from "@test/fake-linear/gateway/model"

import { countingGateway } from "@test/fake-linear/gateway/counting"
import { memoryApiLayer } from "@test/fake-linear/memory-layer"
import { defaultPriorities, defaultViewer } from "@test/fake-linear/model"
import { summaryNode } from "@test/issue-fixtures"
import { recordingConsoleWithErrors } from "@test/recording-console"
import { describe, expect, test } from "bun:test"
import { Console, Effect, Option, Schema } from "effect"

import { IssueWriteApi } from "@/api/issue-write"
import { ContextResolver } from "@/context/resolve"
import { issueId, labelId, teamId, workflowStateId } from "@/domain/id"
import { IssueSummaryNode } from "@/linear/decode/issue"
import { Viewer } from "@/linear/decode/viewer"
import { IssueWriter } from "@/tracker/write"

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
          id: issueId("5f0c1f2a-3b4c-4d5e-8f90-1234567890ab"),
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

  test("closes an issue in an unlinked repository from the issue team", async () => {
    const result = await Effect.gen(function* closeUnlinked() {
      const resolver = yield* ContextResolver
      const writer = yield* IssueWriter
      const context = yield* resolver.resolve({})
      return yield* writer.close(context, "RAT-1", undefined, { dryRun: true })
    }).pipe(Effect.provide(memoryApiLayer(seed, { env, repositories: [] })), Effect.runPromise)

    expect(result.status).toBe("updated")
    expect(result.actions[0]).toMatchObject({ action: "close", status: "updated" })
  })

  test("adds a label in an unlinked repository from the issue team", async () => {
    const result = await Effect.gen(function* labelUnlinked() {
      const resolver = yield* ContextResolver
      const writer = yield* IssueWriter
      const context = yield* resolver.resolve({})
      return yield* writer.addLabels(context, "RAT-1", ["bug"], { dryRun: true })
    }).pipe(Effect.provide(memoryApiLayer(seed, { env, repositories: [] })), Effect.runPromise)

    expect(result.actions[0]).toMatchObject({ action: "add-label", status: "updated" })
  })

  test("updates a state in an unlinked repository from the issue team", async () => {
    const plan = await Effect.gen(function* updateStateUnlinked() {
      const resolver = yield* ContextResolver
      const writer = yield* IssueWriter
      const context = yield* resolver.resolve({})
      return yield* writer.planUpdate(context, "RAT-1", { state: "Todo" })
    }).pipe(Effect.provide(memoryApiLayer(seed, { env, repositories: [] })), Effect.runPromise)

    expect(plan.changes).toMatchObject({ state: "Todo" })
  })

  test("reports the stale-link warning on a write", async () => {
    const errors: string[] = []
    await Effect.gen(function* closeStale() {
      const api = yield* IssueWriteApi
      yield* api.close("RAT-1", undefined, { dryRun: true })
    }).pipe(
      Effect.provide(
        memoryApiLayer(seed, {
          env,
          repositories: [{ key: process.cwd(), team: "OLD", teamId: "team-1" }],
        }),
      ),
      Effect.provideService(Console.Console, recordingConsoleWithErrors([], errors)),
      Effect.runPromise,
    )

    expect(errors).toEqual(["warning: The stored team key OLD is stale. Repaired the link to RAT."])
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
