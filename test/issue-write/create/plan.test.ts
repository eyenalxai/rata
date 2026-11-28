import type { MemorySeed, MemoryTeam } from "@test/fake-linear/gateway/model"

import { lastJson, runIssueMemory } from "@test/cli-harness"
import { defaultPriorities, defaultViewer } from "@test/fake-linear/model"
import { afterEach, describe, expect, test } from "bun:test"
import { Option, Schema } from "effect"

import { labelId, teamId, workflowStateId } from "@/domain/id"
import { Viewer } from "@/linear/decode/viewer"

const viewer = Option.getOrThrow(Schema.decodeOption(Viewer)(defaultViewer))

const team: MemoryTeam = {
  id: teamId("00000000-0000-0000-0000-000000000001"),
  key: "RAT",
  name: "Rata",
  timezone: "America/Los_Angeles",
  states: [
    { id: workflowStateId("s-todo"), name: "Todo", type: "unstarted", position: 1 },
    { id: workflowStateId("s-done"), name: "Done", type: "completed", position: 2 },
  ],
  labels: [{ id: labelId("l1"), name: "ready-for-agent", color: "#111111", scope: "team" }],
  members: [],
  priorities: [...defaultPriorities],
}

const seed: MemorySeed = {
  viewer,
  teams: [team],
  labels: [],
  issues: [],
}

const repositories = [
  {
    key: process.cwd(),
    team: "OLD",
    teamId: "00000000-0000-0000-0000-000000000001",
    defaultAssignee: "me",
    defaultLabels: ["ready-for-agent"],
    defaultPriority: 3,
  },
]

const env = { HOME: "/home/test", LINEAR_API_KEY: "test-key" }

afterEach(() => {
  process.exitCode = 0
})

describe("issue create plan", () => {
  test("keeps the stored team text in a create dry run", async () => {
    const lines: string[] = []
    await runIssueMemory(
      seed,
      ["create", "--title", "Fix login", "--dry-run", "--format", "json"],
      lines,
      repositories,
      { env },
    )
    expect(lastJson(lines)).toMatchObject({
      result: {
        actions: [
          {
            changes: { team: "OLD" },
          },
        ],
      },
    })
  })
})
