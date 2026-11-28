import type { MemoryIssue, MemorySeed } from "@test/fake-linear/gateway/model"

import { lastJsonRecord, runIssueMemory } from "@test/cli-harness"
import { defaultViewer } from "@test/fake-linear/model"
import { describe, expect, test } from "bun:test"
import { Option, Schema } from "effect"

import { issueId, labelId, projectId, teamId, userId, workflowStateId } from "@/domain/id"
import { Viewer } from "@/linear/decode/viewer"

const viewer = Option.getOrThrow(Schema.decodeOption(Viewer)(defaultViewer))

const team = {
  id: teamId("00000000-0000-0000-0000-000000000001"),
  key: "RAT",
  name: "Rata",
  timezone: "America/Los_Angeles",
  states: [
    { id: workflowStateId("state-1"), name: "Todo", type: "unstarted" as const, position: 0 },
    { id: workflowStateId("state-2"), name: "In Progress", type: "started" as const, position: 1 },
  ],
}

const assignee = { id: userId("u1"), name: "Ada", displayName: "ada" }
const label = { id: labelId("label-1"), name: "ready-for-agent" }
const project = { id: projectId("project-1"), name: "Tracker" }

const issue = (input: {
  readonly identifier: string
  readonly priority: "urgent" | "high" | "medium" | "low" | "none"
  readonly createdAt?: string
  readonly state?: { readonly name: string; readonly type: "unstarted" | "started" }
  readonly assignee?: typeof assignee | null
  readonly labels?: readonly { readonly id: ReturnType<typeof labelId>; readonly name: string }[]
}): MemoryIssue => ({
  summary: {
    id: issueId(`issue-${input.identifier}`),
    identifier: input.identifier,
    title: `Title ${input.identifier}`,
    url: `https://linear.app/acme/issue/${input.identifier}/title`,
    state: input.state ?? { name: "Todo", type: "unstarted" },
    priority: input.priority,
    createdAt: input.createdAt ?? "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-02T00:00:00.000Z",
    assignee: input.assignee === undefined ? assignee : input.assignee,
    project,
    parent: null,
    labels: { nodes: input.labels ?? [label] },
  },
  description: `Body ${input.identifier}`,
  team: { id: team.id, key: team.key, name: team.name },
})

const seed = (issues: readonly MemoryIssue[]): MemorySeed => ({
  viewer,
  teams: [team],
  labels: [{ id: label.id, name: label.name, color: "#111111", teamId: team.id }],
  projects: [
    {
      id: project.id,
      name: project.name,
      progress: 0.5,
      status: { name: "Started" },
      trashed: false,
    },
  ],
  issues,
})

const rowsOf = (lines: readonly string[]): readonly { readonly identifier: string }[] => {
  const items = lastJsonRecord(lines).issues
  const decoded = Option.getOrThrow(
    Schema.decodeUnknownOption(Schema.Array(Schema.Struct({ identifier: Schema.String })))(items),
  )
  return decoded
}

describe("issue list priority behavior", () => {
  test("filters on no priority without dropping it", async () => {
    const lines: string[] = []
    await runIssueMemory(
      seed([
        issue({ identifier: "RAT-1", priority: "none" }),
        issue({ identifier: "RAT-2", priority: "urgent" }),
      ]),
      ["list", "--priority", "none", "--format", "json"],
      lines,
    )

    expect(rowsOf(lines).map((row) => row.identifier)).toEqual(["RAT-1"])
  })

  test("sorts one page by priority rank and then by creation time", async () => {
    const lines: string[] = []
    await runIssueMemory(
      seed([
        issue({ identifier: "RAT-1", priority: "low", createdAt: "2026-01-05T00:00:00.000Z" }),
        issue({ identifier: "RAT-2", priority: "urgent", createdAt: "2026-01-05T00:00:00.000Z" }),
        issue({ identifier: "RAT-3", priority: "high", createdAt: "2026-01-04T00:00:00.000Z" }),
        issue({ identifier: "RAT-4", priority: "high", createdAt: "2026-01-02T00:00:00.000Z" }),
        issue({ identifier: "RAT-5", priority: "none", createdAt: "2026-01-05T00:00:00.000Z" }),
      ]),
      ["list", "--sort", "priority", "--limit", "3", "--format", "json"],
      lines,
    )

    expect(rowsOf(lines).map((row) => row.identifier)).toEqual(["RAT-2", "RAT-4", "RAT-3"])
    expect(lastJsonRecord(lines).pageInfo).toEqual({ hasNextPage: true, endCursor: "issue-RAT-3" })
  })

  test("drains every page with --all and sorts the whole set", async () => {
    const lines: string[] = []
    await runIssueMemory(
      seed([
        issue({ identifier: "RAT-1", priority: "low" }),
        issue({ identifier: "RAT-2", priority: "urgent" }),
      ]),
      ["list", "--sort", "priority", "--all", "--limit", "1", "--format", "json"],
      lines,
    )

    expect(rowsOf(lines).map((row) => row.identifier)).toEqual(["RAT-2", "RAT-1"])
    expect(lastJsonRecord(lines).pageInfo).toEqual({ hasNextPage: false, endCursor: null })
  })

  test("keeps the unblocked rule while sorting", async () => {
    const lines: string[] = []
    await runIssueMemory(
      seed([
        issue({ identifier: "RAT-1", priority: "low" }),
        issue({ identifier: "RAT-2", priority: "urgent" }),
        {
          ...issue({ identifier: "RAT-3", priority: "urgent" }),
          inverseRelations: [
            {
              type: "blocks",
              issue: {
                id: issueId("issue-blocker"),
                identifier: "RAT-9",
                title: "Blocker",
                state: { name: "Todo", type: "unstarted" },
              },
            },
          ],
        },
      ]),
      ["list", "--unblocked", "--sort", "priority", "--format", "json"],
      lines,
    )

    expect(rowsOf(lines).map((row) => row.identifier)).toEqual(["RAT-2", "RAT-1"])
  })
})
