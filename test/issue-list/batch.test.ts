import type { MemoryIssue, MemorySeed } from "@test/fake-linear/gateway/model"

import { lastJsonRecord, runIssueMemory } from "@test/cli-harness"
import { defaultViewer } from "@test/fake-linear/model"
import { afterEach, describe, expect, test } from "bun:test"
import { Option, Schema } from "effect"

import { issueId, teamId, userId } from "@/domain/id"
import { Viewer } from "@/linear/decode/viewer"

const viewer = Option.getOrThrow(Schema.decodeUnknownOption(Viewer)(defaultViewer))

const team = { id: teamId("team-1"), key: "RAT", name: "Rata", timezone: "America/Los_Angeles" }
const assignee = { id: userId("u1"), name: "Ada", displayName: "ada" }

const issue = (identifier: string): MemoryIssue => ({
  summary: {
    id: issueId(`issue-${identifier}`),
    identifier,
    title: `Title ${identifier}`,
    url: `https://linear.app/acme/issue/${identifier}/title`,
    state: { name: "Todo", type: "unstarted" },
    priority: "none",
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-02T00:00:00.000Z",
    assignee,
    project: null,
    parent: null,
    labels: { nodes: [] },
  },
  description: `Body ${identifier}`,
  team,
})

const seed = (issues: readonly MemoryIssue[]): MemorySeed => ({
  viewer,
  teams: [team],
  labels: [],
  issues,
})

const openBlocker = {
  id: issueId("issue-9"),
  identifier: "RAT-9",
  title: "Blocker",
  state: { name: "Todo", type: "unstarted" as const },
}

const relatedIssue: MemoryIssue = {
  ...issue("RAT-1"),
  inverseRelations: [{ type: "blocks", issue: openBlocker }],
}

const ErrorEnvelope = Schema.Struct({
  error: Schema.Struct({ code: Schema.String, message: Schema.String }),
})

const errorOf = (lines: readonly string[]) =>
  Option.getOrThrow(Schema.decodeUnknownOption(ErrorEnvelope)(lastJsonRecord(lines))).error

const IssueIdentity = Schema.Struct({ identifier: Schema.String })

const identifiersOf = (lines: readonly string[]): readonly string[] => {
  const decoded = Schema.decodeUnknownOption(Schema.Array(IssueIdentity))(
    lastJsonRecord(lines).issues,
  )
  return Option.isSome(decoded) ? decoded.value.map((entry) => entry.identifier) : []
}

afterEach(() => {
  process.exitCode = 0
})

describe("issue list --id", () => {
  test("reads a known set and bypasses the linked team", async () => {
    const lines: string[] = []
    await runIssueMemory(
      seed([issue("RAT-1"), issue("RAT-2")]),
      ["list", "--id", "RAT-1", "--id", "RAT-2", "--json"],
      lines,
      [],
    )

    expect(identifiersOf(lines)).toEqual(["RAT-1", "RAT-2"])
    expect(lastJsonRecord(lines).pageInfo).toEqual({ hasNextPage: false, endCursor: "issue-RAT-2" })
  })

  test("narrows by team and composes with relations and fields", async () => {
    const lines: string[] = []
    await runIssueMemory(
      seed([relatedIssue]),
      [
        "list",
        "--id",
        "RAT-1",
        "--team",
        "RAT",
        "--include",
        "relations",
        "--json",
        "--fields",
        "identifier,relations.blockedBy.identifier",
      ],
      lines,
    )

    expect(lastJsonRecord(lines)).toEqual({
      issues: [{ identifier: "RAT-1", relations: { blockedBy: ["RAT-9"] } }],
      pageInfo: { hasNextPage: false, endCursor: "issue-RAT-1" },
    })
  })

  test("returns not_found and names a missing ref", async () => {
    const lines: string[] = []
    await runIssueMemory(
      seed([issue("RAT-1")]),
      ["list", "--id", "RAT-1", "--id", "RAT-2", "--json"],
      lines,
      [],
    )

    const error = errorOf(lines)
    expect(error.code).toBe("not_found")
    expect(error.message).toContain("RAT-2")
    expect(process.exitCode).toBe(3)
  })

  test("drains pages with --all and checks every ref", async () => {
    const lines: string[] = []
    await runIssueMemory(
      seed([issue("RAT-1"), issue("RAT-2")]),
      ["list", "--id", "RAT-1", "--id", "RAT-2", "--all", "--json"],
      lines,
      [],
    )

    expect(identifiersOf(lines)).toEqual(["RAT-1", "RAT-2"])
    expect(lastJsonRecord(lines).pageInfo).toEqual({ hasNextPage: false, endCursor: null })
  })

  test("turns a linear.app URL into an identifier", async () => {
    const lines: string[] = []
    await runIssueMemory(
      seed([issue("RAT-1")]),
      ["list", "--id", "https://linear.app/acme/issue/RAT-1/some-slug", "--json"],
      lines,
      [],
    )

    expect(identifiersOf(lines)).toEqual(["RAT-1"])
  })

  test("does not report a missing ref on an incomplete page", async () => {
    const lines: string[] = []
    await runIssueMemory(
      seed([issue("RAT-1"), issue("RAT-2")]),
      ["list", "--id", "RAT-1", "--id", "RAT-2", "--limit", "1", "--json"],
      lines,
      [],
    )

    expect(process.exitCode).toBe(0)
    expect(identifiersOf(lines)).toEqual(["RAT-1"])
    expect(lastJsonRecord(lines).pageInfo).toEqual({
      hasNextPage: true,
      endCursor: "issue-RAT-1",
    })
  })

  test("does not check refs on a continued page", async () => {
    const lines: string[] = []
    await runIssueMemory(
      seed([issue("RAT-1"), issue("RAT-2")]),
      ["list", "--id", "RAT-1", "--id", "RAT-2", "--after", "issue-RAT-1", "--json"],
      lines,
      [],
    )

    expect(process.exitCode).toBe(0)
    expect(identifiersOf(lines)).toEqual(["RAT-2"])
  })

  test("rejects a malformed ref before any request", async () => {
    const lines: string[] = []
    await runIssueMemory(seed([]), ["list", "--id", "NOPE", "--json"], lines, [])

    expect(errorOf(lines).code).toBe("validation")
    expect(process.exitCode).toBe(2)
  })
})
