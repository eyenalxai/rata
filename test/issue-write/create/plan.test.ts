import type { MemorySeed, MemoryTeam } from "@test/fake-linear/gateway/model"

import { lastJson, runIssueMemory } from "@test/cli-harness"
import { defaultPriorities, defaultViewer } from "@test/fake-linear/model"
import { afterEach, describe, expect, test } from "bun:test"
import { Option, Schema } from "effect"

import { labelId, teamId, workflowStateId } from "@/domain/id"
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
    team: "RAT",
    teamId: "team-1",
    defaultAssignee: "me",
    defaultLabels: ["ready-for-agent"],
    defaultPriority: 3,
  },
]

const env = { HOME: "/home/test", LINEAR_API_KEY: "test-key" }

const planChanges = async (
  repositorySeed: typeof repositories,
  args: readonly string[],
): Promise<unknown> => {
  const lines: string[] = []
  await runIssueMemory(
    seed,
    ["create", "--title", "Fix login", "--dry-run", "--format", "json", ...args],
    lines,
    repositorySeed,
    { env },
  )
  return lastJson(lines)
}

afterEach(() => {
  process.exitCode = 0
})

describe("issue create plan", () => {
  test("uses the context defaults and the team", async () => {
    const payload = await planChanges(repositories, ["--team", "RAT"])
    expect(payload).toMatchObject({
      issue: null,
      result: {
        action: "create",
        status: "updated",
        dryRun: true,
        changed: ["issue"],
        actions: [
          {
            action: "create",
            target: "new",
            status: "updated",
            changes: {
              team: "RAT",
              title: "Fix login",
              labels: ["ready-for-agent"],
              assignee: "me",
              priority: "medium",
            },
          },
        ],
      },
    })
  })

  test("keeps the stored team text in a create dry run", async () => {
    const payload = await planChanges(
      [
        {
          key: process.cwd(),
          team: "OLD",
          teamId: "team-1",
          defaultAssignee: "me",
          defaultLabels: ["ready-for-agent"],
          defaultPriority: 3,
        },
      ],
      [],
    )
    expect(payload).toMatchObject({
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
