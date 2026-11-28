import type { MemorySeed } from "@test/fake-linear/gateway/model"

import { lastJsonRecord, runIssueMemory } from "@test/cli-harness"
import { defaultViewer } from "@test/fake-linear/model"
import { afterEach, describe, expect, test } from "bun:test"
import { Option, Schema } from "effect"

import { labelId, projectId, teamId, userId, workflowStateId } from "@/domain/id"
import { Viewer } from "@/linear/decode/viewer"

const viewer = Option.getOrThrow(Schema.decodeUnknownOption(Viewer)(defaultViewer))
const userIdValue = "5f0c1f2a-3b4c-4d5e-8f90-1234567890ab"

const team = {
  id: teamId("00000000-0000-0000-0000-000000000001"),
  key: "RAT",
  name: "Rata",
  timezone: "America/Los_Angeles",
  states: [
    { id: workflowStateId("state-1"), name: "Todo", type: "unstarted" as const, position: 0 },
    {
      id: workflowStateId("state-2"),
      name: "In Progress",
      type: "started" as const,
      position: 1,
    },
    { id: workflowStateId("state-3"), name: "Done", type: "completed" as const, position: 2 },
  ],
  members: [{ id: userId(userIdValue), name: "Ada", displayName: "ada", email: "ada@example.com" }],
}

const labels: readonly MemorySeed["labels"][number][] = [
  { id: labelId("label-1"), name: "ready-for-agent", color: "#111111", teamId: team.id },
  { id: labelId("label-2"), name: "bug", color: "#EB5757", teamId: team.id },
]

const projects: readonly NonNullable<MemorySeed["projects"]>[number][] = [
  {
    id: projectId("project-1"),
    name: "Tracker",
    progress: 0.5,
    status: { name: "Started" },
    trashed: false,
  },
]

const emptySeed = (): MemorySeed => ({
  viewer,
  teams: [team],
  labels,
  projects,
  issues: [],
})

const ErrorEnvelope = Schema.Struct({
  error: Schema.Struct({
    code: Schema.String,
    message: Schema.String,
    hint: Schema.NullOr(Schema.String),
  }),
})

const errorOf = (lines: readonly string[]) =>
  Option.getOrThrow(Schema.decodeUnknownOption(ErrorEnvelope)(lastJsonRecord(lines))).error

afterEach(() => {
  process.exitCode = 0
})

describe("issue list filter existence", () => {
  test("fails a read with not_found and the team repair hint when the key is gone", async () => {
    const lines: string[] = []
    await runIssueMemory(emptySeed(), ["list", "--format", "json"], lines, [
      { key: process.cwd(), team: "GONE" },
    ])

    const error = errorOf(lines)
    expect(process.exitCode).toBe(3)
    expect(error.code).toBe("not_found")
    expect(error.hint).toContain("rata admin team list")
    expect(error.hint).toContain("rata admin link")
  })

  test("rejects an unknown state with the valid state names", async () => {
    const lines: string[] = []
    await runIssueMemory(emptySeed(), ["list", "--state", "In Progess", "--format", "json"], lines)

    const error = errorOf(lines)
    expect(process.exitCode).toBe(3)
    expect(error.code).toBe("not_found")
    expect(error.message).toContain("Todo")
    expect(error.message).toContain("In Progress")
    expect(error.message).toContain("Done")
  })

  test("keeps an empty page for a valid state", async () => {
    const lines: string[] = []
    await runIssueMemory(emptySeed(), ["list", "--state", "In Progress", "--format", "json"], lines)

    expect(process.exitCode).toBe(0)
    expect(lastJsonRecord(lines)).toEqual({
      issues: [],
      pageInfo: { hasNextPage: false, endCursor: null },
    })
  })

  test("rejects an unknown label with the valid label names", async () => {
    const lines: string[] = []
    await runIssueMemory(
      emptySeed(),
      ["list", "--label", "redy-for-agent", "--format", "json"],
      lines,
    )

    const error = errorOf(lines)
    expect(process.exitCode).toBe(3)
    expect(error.code).toBe("not_found")
    expect(error.message).toContain("ready-for-agent")
    expect(error.message).toContain("bug")
  })

  test("keeps an empty page for a valid label", async () => {
    const lines: string[] = []
    await runIssueMemory(
      emptySeed(),
      ["list", "--label", "ready-for-agent", "--format", "json"],
      lines,
    )

    expect(process.exitCode).toBe(0)
    expect(lastJsonRecord(lines)).toEqual({
      issues: [],
      pageInfo: { hasNextPage: false, endCursor: null },
    })
  })

  test("rejects an unknown project with the valid project names", async () => {
    const lines: string[] = []
    await runIssueMemory(emptySeed(), ["list", "--project", "No Such", "--format", "json"], lines)

    const error = errorOf(lines)
    expect(process.exitCode).toBe(3)
    expect(error.code).toBe("not_found")
    expect(error.hint).toContain("Tracker")
  })

  test("keeps an empty page for a valid project", async () => {
    const lines: string[] = []
    await runIssueMemory(emptySeed(), ["list", "--project", "Tracker", "--format", "json"], lines)

    expect(process.exitCode).toBe(0)
    expect(lastJsonRecord(lines)).toEqual({
      issues: [],
      pageInfo: { hasNextPage: false, endCursor: null },
    })
  })

  test("rejects a malformed assignee as validation", async () => {
    const lines: string[] = []
    await runIssueMemory(
      emptySeed(),
      ["list", "--assignee", "not-a-user", "--format", "json"],
      lines,
    )

    const error = errorOf(lines)
    expect(process.exitCode).toBe(2)
    expect(error.code).toBe("validation")
    expect(error.hint).toContain("me")
  })

  test("rejects an assignee UUID that does not resolve", async () => {
    const lines: string[] = []
    await runIssueMemory(
      emptySeed(),
      ["list", "--assignee", "00000000-0000-4000-8000-000000000000", "--format", "json"],
      lines,
    )

    const error = errorOf(lines)
    expect(process.exitCode).toBe(3)
    expect(error.code).toBe("not_found")
  })

  test("accepts an assignee UUID that resolves", async () => {
    const lines: string[] = []
    await runIssueMemory(
      emptySeed(),
      ["list", "--assignee", userId(userIdValue), "--format", "json"],
      lines,
    )

    expect(process.exitCode).toBe(0)
    expect(lastJsonRecord(lines)).toEqual({
      issues: [],
      pageInfo: { hasNextPage: false, endCursor: null },
    })
  })

  test("accepts me as the viewer", async () => {
    const lines: string[] = []
    await runIssueMemory(emptySeed(), ["list", "--assignee", "me", "--format", "json"], lines)

    expect(process.exitCode).toBe(0)
    expect(lastJsonRecord(lines)).toEqual({
      issues: [],
      pageInfo: { hasNextPage: false, endCursor: null },
    })
  })
})
