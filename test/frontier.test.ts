import type { Handler } from "@test/fake-linear/model"

import { lastJson, runRoot } from "@test/cli-harness"
import {
  baseDetail,
  jsonResponse,
  pageInfo,
  readBody,
  summaryNode,
  withTeamLookup,
} from "@test/issue-fixtures"
import { afterEach, describe, expect, test } from "bun:test"
import { Option, Schema } from "effect"

const NextDocument = Schema.Struct({
  issue: Schema.NullOr(Schema.Struct({ identifier: Schema.String })),
})

const Blocker = Schema.Struct({
  identifier: Schema.String,
  title: Schema.String,
  state: Schema.Struct({ name: Schema.String, type: Schema.String }),
  closed: Schema.Boolean,
})

const WhyDocument = Schema.Struct({
  issue: Schema.Struct({ identifier: Schema.String, title: Schema.String }),
  blocked: Schema.Boolean,
  blockedBy: Schema.Array(Blocker),
})

const ErrorEnvelope = Schema.Struct({
  error: Schema.Struct({ code: Schema.String, hint: Schema.NullOr(Schema.String) }),
})

const nextDocument = (lines: readonly string[]) =>
  Option.getOrThrow(Schema.decodeUnknownOption(NextDocument)(lastJson(lines)))

const whyDocument = (lines: readonly string[]) =>
  Option.getOrThrow(Schema.decodeUnknownOption(WhyDocument)(lastJson(lines)))

const errorEnvelope = (lines: readonly string[]) =>
  Option.getOrThrow(Schema.decodeUnknownOption(ErrorEnvelope)(lastJson(lines)))

const nextHandler = (nodes: readonly unknown[], captured: Record<string, unknown>[]): Handler =>
  withTeamLookup((request) => {
    const body = readBody(request)
    if (body.query.includes("query IssueId")) {
      return jsonResponse({ data: { issue: { id: "parent-1" } } })
    }
    captured.push(body.variables)
    return jsonResponse({ data: { issues: { nodes, pageInfo } } })
  })

const blocker = (identifier: string, state: { name: string; type: string }) => ({
  id: `i-${identifier}`,
  identifier,
  title: `Title ${identifier}`,
  state,
})

const whyHandler =
  (blockers: readonly unknown[]): Handler =>
  () =>
    jsonResponse({
      data: {
        issue: {
          ...baseDetail,
          inverseRelations: {
            nodes: blockers.map((issue, index) => ({
              id: `relation-${index}`,
              type: "blocks",
              issue,
            })),
            pageInfo,
          },
        },
      },
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

    expect(nextDocument(lines).issue?.identifier).toBe("RAT-2")
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

    expect(nextDocument(lines).issue?.identifier).toBe("RAT-1")
  })

  test("drains every matching page before it picks one", async () => {
    const requests: Record<string, unknown>[] = []
    const lines: string[] = []
    const handler = withTeamLookup((request) => {
      const body = readBody(request)
      if (body.query.includes("query IssueId")) {
        return jsonResponse({ data: { issue: { id: "parent-1" } } })
      }
      requests.push(body.variables)
      if (body.variables.after === null) {
        return jsonResponse({
          data: {
            issues: {
              nodes: [{ ...summaryNode("RAT-1"), priority: 4 }],
              pageInfo: { hasNextPage: true, endCursor: "cursor-1" },
            },
          },
        })
      }
      return jsonResponse({
        data: { issues: { nodes: [{ ...summaryNode("RAT-2"), priority: 1 }], pageInfo } },
      })
    })

    await runRoot(handler, ["next", "--parent", "RAT-7", "--json"], lines)

    expect(nextDocument(lines).issue?.identifier).toBe("RAT-2")
    expect(requests).toHaveLength(2)
    expect(requests[1]?.after).toBe("cursor-1")
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

    expect(nextDocument(lines).issue).toBeNull()
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

describe("rata why", () => {
  test("reports an open blocker", async () => {
    const lines: string[] = []
    await runRoot(
      whyHandler([blocker("RAT-9", { name: "In Progress", type: "started" })]),
      ["why", "RAT-1", "--json"],
      lines,
    )

    const document = whyDocument(lines)
    expect(document.issue).toEqual({ identifier: "RAT-1", title: "The issue" })
    expect(document.blocked).toBe(true)
    expect(document.blockedBy).toEqual([
      {
        identifier: "RAT-9",
        title: "Title RAT-9",
        state: { name: "In Progress", type: "started" },
        closed: false,
      },
    ])
  })

  test("treats a completed blocker as closed", async () => {
    const lines: string[] = []
    await runRoot(
      whyHandler([blocker("RAT-9", { name: "Done", type: "completed" })]),
      ["why", "RAT-1", "--json"],
      lines,
    )

    const document = whyDocument(lines)
    expect(document.blocked).toBe(false)
    expect(document.blockedBy[0]?.closed).toBe(true)
  })

  test("treats a canceled blocker as closed", async () => {
    const lines: string[] = []
    await runRoot(
      whyHandler([blocker("RAT-8", { name: "Canceled", type: "canceled" })]),
      ["why", "RAT-1", "--json"],
      lines,
    )

    const document = whyDocument(lines)
    expect(document.blocked).toBe(false)
    expect(document.blockedBy[0]?.closed).toBe(true)
  })

  test("reports ready when there are no blockers", async () => {
    const lines: string[] = []
    await runRoot(whyHandler([]), ["why", "RAT-1", "--json"], lines)

    const document = whyDocument(lines)
    expect(document.blocked).toBe(false)
    expect(document.blockedBy).toEqual([])
  })

  test("prints the open blockers in human output", async () => {
    const lines: string[] = []
    await runRoot(
      whyHandler([
        blocker("RAT-9", { name: "In Progress", type: "started" }),
        blocker("RAT-8", { name: "Todo", type: "unstarted" }),
      ]),
      ["why", "RAT-1"],
      lines,
    )

    expect(lines).toEqual([
      "RAT-1 is blocked by:",
      "  RAT-9  [In Progress]  Title RAT-9",
      "  RAT-8  [Todo]  Title RAT-8",
    ])
  })

  test("prints ready in human output when every blocker is closed", async () => {
    const lines: string[] = []
    await runRoot(
      whyHandler([blocker("RAT-9", { name: "Done", type: "completed" })]),
      ["why", "RAT-1"],
      lines,
    )

    expect(lines).toEqual(["RAT-1 is ready."])
  })
})
