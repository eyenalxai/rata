import type { MemoryIssue, MemorySeed } from "@test/fake-linear/gateway/model"

import { lastJson, runRootMemory } from "@test/cli-harness"
import { defaultViewer } from "@test/fake-linear/model"
import { afterEach, describe, expect, test } from "bun:test"
import { Option, Schema } from "effect"

import { issueId, teamId, userId } from "@/domain/id"
import { Viewer } from "@/linear/decode/viewer"

const viewer = Option.getOrThrow(Schema.decodeUnknownOption(Viewer)(defaultViewer))
const team = { id: teamId("team-1"), key: "RAT", name: "Rata", timezone: "America/Los_Angeles" }
const assignee = { id: userId("u1"), name: "Ada", displayName: "ada" }
const parent = { id: issueId("issue-RAT-7"), identifier: "RAT-7", title: "Parent" }

const NextDocument = Schema.NullOr(Schema.Struct({ identifier: Schema.String }))

const ErrorEnvelope = Schema.Struct({
  error: Schema.Struct({ code: Schema.String, hint: Schema.NullOr(Schema.String) }),
})

const nextDocument = (lines: readonly string[]) =>
  Option.getOrThrow(Schema.decodeUnknownOption(NextDocument)(lastJson(lines)))

const errorEnvelope = (lines: readonly string[]) =>
  Option.getOrThrow(Schema.decodeUnknownOption(ErrorEnvelope)(lastJson(lines)))

const issue = (input: {
  readonly identifier: string
  readonly priority: "urgent" | "high" | "medium" | "low" | "none"
  readonly createdAt?: string
  readonly parent?: typeof parent | null
  readonly assignee?: typeof assignee | null
}): MemoryIssue => ({
  summary: {
    id: issueId(`issue-${input.identifier}`),
    identifier: input.identifier,
    title: `Title ${input.identifier}`,
    url: `https://linear.app/acme/issue/${input.identifier}/title`,
    state: { name: "Todo", type: "unstarted" },
    priority: input.priority,
    createdAt: input.createdAt ?? "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-02T00:00:00.000Z",
    assignee: input.assignee === undefined ? assignee : input.assignee,
    project: null,
    parent: input.parent ?? null,
    labels: { nodes: [] },
  },
  description: `Body ${input.identifier}`,
  team,
})

const seed = (issues: readonly MemoryIssue[]): MemorySeed => ({
  viewer,
  teams: [team],
  labels: [],
  issues,
})

const parentIssue = issue({ identifier: "RAT-7", priority: "none" })

const readyChildren = (): readonly MemoryIssue[] => [
  parentIssue,
  issue({ identifier: "RAT-2", priority: "urgent", parent, assignee: null }),
  issue({ identifier: "RAT-3", priority: "medium", parent, assignee: null }),
  issue({ identifier: "RAT-1", priority: "medium", parent, assignee: null }),
]

afterEach(() => {
  process.exitCode = 0
})

describe("rata next", () => {
  test("returns the most urgent ready child", async () => {
    const lines: string[] = []
    await runRootMemory(seed(readyChildren()), ["next", "--parent", "RAT-7", "--json"], lines)

    expect(nextDocument(lines)?.identifier).toBe("RAT-2")
  })

  test("breaks a priority tie by the oldest createdAt", async () => {
    const lines: string[] = []
    await runRootMemory(
      seed([
        parentIssue,
        issue({
          identifier: "RAT-3",
          priority: "medium",
          createdAt: "2026-01-03T00:00:00.000Z",
          parent,
          assignee: null,
        }),
        issue({
          identifier: "RAT-1",
          priority: "medium",
          createdAt: "2026-01-01T00:00:00.000Z",
          parent,
          assignee: null,
        }),
      ]),
      ["next", "--parent", "RAT-7", "--json"],
      lines,
    )

    expect(nextDocument(lines)?.identifier).toBe("RAT-1")
  })

  test("picks one ready child from the sorted page", async () => {
    const lines: string[] = []
    await runRootMemory(
      seed([
        parentIssue,
        issue({ identifier: "RAT-1", priority: "low", parent, assignee: null }),
        issue({ identifier: "RAT-2", priority: "urgent", parent, assignee: null }),
      ]),
      ["next", "--parent", "RAT-7", "--json"],
      lines,
    )

    expect(nextDocument(lines)?.identifier).toBe("RAT-2")
  })

  test("prints No ready ticket. and exits 0 when none is ready", async () => {
    const lines: string[] = []
    await runRootMemory(seed([parentIssue]), ["next", "--parent", "RAT-7"], lines)

    expect(lines).toEqual(["No ready ticket."])
    expect(process.exitCode).toBe(0)
  })

  test("returns a null issue in JSON when none is ready", async () => {
    const lines: string[] = []
    await runRootMemory(seed([parentIssue]), ["next", "--parent", "RAT-7", "--json"], lines)

    expect(nextDocument(lines)).toBeNull()
  })

  test("selects fields from the summary", async () => {
    const lines: string[] = []
    await runRootMemory(
      seed(readyChildren()),
      ["next", "--parent", "RAT-7", "--json", "--fields", "identifier,createdAt"],
      lines,
    )

    expect(lastJson(lines)).toEqual({
      identifier: "RAT-2",
      createdAt: "2026-01-01T00:00:00.000Z",
    })
  })

  test("returns null with --fields when none is ready", async () => {
    const lines: string[] = []
    await runRootMemory(
      seed([parentIssue]),
      ["next", "--parent", "RAT-7", "--json", "--fields", "identifier"],
      lines,
    )

    expect(lastJson(lines)).toBeNull()
  })

  test("requires --parent", async () => {
    const lines: string[] = []
    await runRootMemory(seed([]), ["next", "--json"], lines)

    const error = errorEnvelope(lines).error
    expect(error.code).toBe("validation")
    expect(error.hint).toBe("Pass --parent <ref>.")
    expect(process.exitCode).toBe(2)
  })
})
