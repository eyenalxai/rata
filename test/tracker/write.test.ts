import type { MemorySeed, MemoryTeam } from "@test/fake-linear/gateway/model"

import { memoryApiLayer } from "@test/fake-linear/memory-layer"
import { defaultPriorities, defaultViewer } from "@test/fake-linear/model"
import { describe, expect, test } from "bun:test"
import { Effect, Option, Schema } from "effect"

import { ContextResolver } from "@/context/resolve"
import { labelId, teamId, workflowStateId } from "@/domain/id"
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

  test("uses the context team when the caller resolved another team", async () => {
    const plan = await Effect.gen(function* planOtherTeam() {
      const resolver = yield* ContextResolver
      const writer = yield* IssueWriter
      const context = yield* resolver.resolve({ team: "OPS" })
      return yield* writer.planCreate(context, { title: "Fix login", useDefaultLabels: false })
    }).pipe(Effect.provide(memoryApiLayer(seed, { env, repositories })), Effect.runPromise)

    expect(plan.team).toBe("OPS")
  })
})
