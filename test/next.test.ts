import type { Handler } from "@test/fake-linear/model"

import { lastJson, runRoot } from "@test/cli-harness"
import { jsonResponse, pageInfo, readBody, summaryNode, withTeamLookup } from "@test/issue-fixtures"
import { afterEach, describe, expect, test } from "bun:test"
import { Option, Schema } from "effect"

const NextDocument = Schema.NullOr(Schema.Struct({ identifier: Schema.String }))

const ErrorEnvelope = Schema.Struct({
  error: Schema.Struct({ code: Schema.String, hint: Schema.NullOr(Schema.String) }),
})

const nextDocument = (lines: readonly string[]) =>
  Option.getOrThrow(Schema.decodeUnknownOption(NextDocument)(lastJson(lines)))

const errorEnvelope = (lines: readonly string[]) =>
  Option.getOrThrow(Schema.decodeUnknownOption(ErrorEnvelope)(lastJson(lines)))

const prioritySort = [
  {
    priority: {
      order: "Ascending",
      noPriorityFirst: false,
      usePrioritySortOrderTiebreaker: false,
    },
  },
  { createdAt: { order: "Ascending" } },
]

const nextHandler = (nodes: readonly unknown[], captured: Record<string, unknown>[]): Handler =>
  withTeamLookup((request) => {
    const body = readBody(request)
    if (body.query.includes("query IssueId")) {
      return jsonResponse({ data: { issue: { id: "parent-1" } } })
    }
    captured.push(body.variables)
    return jsonResponse({ data: { issues: { nodes, pageInfo } } })
  })

afterEach(() => {
  process.exitCode = 0
})

describe("rata next", () => {
  test("returns the most urgent ready child", async () => {
    const captured: Record<string, unknown>[] = []
    const lines: string[] = []
    await runRoot(
      nextHandler(
        [
          { ...summaryNode("RAT-2"), priority: 1, createdAt: "2026-01-05T00:00:00.000Z" },
          { ...summaryNode("RAT-3"), priority: 3, createdAt: "2026-01-03T00:00:00.000Z" },
          { ...summaryNode("RAT-1"), priority: 3, createdAt: "2026-01-01T00:00:00.000Z" },
        ],
        captured,
      ),
      ["next", "--parent", "RAT-7", "--json"],
      lines,
    )

    expect(nextDocument(lines)?.identifier).toBe("RAT-2")
    expect(captured[0]?.filter).toEqual({
      and: [
        { team: { id: { eq: "team-1" } } },
        { assignee: { null: true } },
        { parent: { id: { eq: "parent-1" } } },
        { hasBlockedByRelations: { eq: false } },
        { state: { type: { nin: ["completed", "canceled"] } } },
      ],
    })
    expect(captured[0]?.after).toBeNull()
    expect(captured[0]?.sort).toEqual(prioritySort)
  })

  test("breaks a priority tie by the oldest createdAt", async () => {
    const captured: Record<string, unknown>[] = []
    const lines: string[] = []
    await runRoot(
      nextHandler(
        [
          { ...summaryNode("RAT-3"), priority: 3, createdAt: "2026-01-03T00:00:00.000Z" },
          { ...summaryNode("RAT-1"), priority: 3, createdAt: "2026-01-01T00:00:00.000Z" },
        ],
        captured,
      ),
      ["next", "--parent", "RAT-7", "--json"],
      lines,
    )

    expect(nextDocument(lines)?.identifier).toBe("RAT-1")
  })

  test("fetches one page with the server sort before it picks one", async () => {
    const queries: string[] = []
    const requests: Record<string, unknown>[] = []
    const lines: string[] = []
    const handler = withTeamLookup((request) => {
      const body = readBody(request)
      if (body.query.includes("query IssueId")) {
        return jsonResponse({ data: { issue: { id: "parent-1" } } })
      }
      queries.push(body.query)
      requests.push(body.variables)
      return jsonResponse({
        data: {
          issues: {
            nodes: [
              { ...summaryNode("RAT-1"), priority: 4 },
              { ...summaryNode("RAT-2"), priority: 1 },
            ],
            pageInfo: { hasNextPage: true, endCursor: "cursor-1" },
          },
        },
      })
    })

    await runRoot(handler, ["next", "--parent", "RAT-7", "--json"], lines)

    expect(nextDocument(lines)?.identifier).toBe("RAT-2")
    expect(requests).toHaveLength(1)
    expect(requests[0]?.after).toBeNull()
    expect(requests[0]?.sort).toEqual(prioritySort)
    expect(queries[0]).toContain("sort: $sort")
    expect(queries[0]).not.toContain("orderBy: createdAt")
  })

  test("prints No ready ticket. and exits 0 when none is ready", async () => {
    const lines: string[] = []
    await runRoot(nextHandler([], []), ["next", "--parent", "RAT-7"], lines)

    expect(lines).toEqual(["No ready ticket."])
    expect(process.exitCode).toBe(0)
  })

  test("returns a null issue in JSON when none is ready", async () => {
    const lines: string[] = []
    await runRoot(nextHandler([], []), ["next", "--parent", "RAT-7", "--json"], lines)

    expect(nextDocument(lines)).toBeNull()
  })

  test("selects fields from the summary", async () => {
    const lines: string[] = []
    await runRoot(
      nextHandler([{ ...summaryNode("RAT-2"), priority: 1 }], []),
      ["next", "--parent", "RAT-7", "--json", "--fields", "identifier,createdAt"],
      lines,
    )

    expect(lastJson(lines)).toEqual({
      identifier: "RAT-2",
      createdAt: "2026-01-01T08:00:00.000Z",
    })
  })

  test("returns null with --fields when none is ready", async () => {
    const lines: string[] = []
    await runRoot(
      nextHandler([], []),
      ["next", "--parent", "RAT-7", "--json", "--fields", "identifier"],
      lines,
    )

    expect(lastJson(lines)).toBeNull()
  })

  test("requires --parent", async () => {
    const captured: Record<string, unknown>[] = []
    const lines: string[] = []
    await runRoot(nextHandler([], captured), ["next", "--json"], lines)

    const error = errorEnvelope(lines).error
    expect(error.code).toBe("validation")
    expect(error.hint).toBe("Pass --parent <ref>.")
    expect(captured).toEqual([])
    expect(process.exitCode).toBe(2)
  })
})
