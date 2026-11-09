import type { Handler } from "@test/fake-linear/model"

import { lastJson, runIssue } from "@test/cli-harness"
import { jsonResponse, pageInfo, readBody, summaryNode } from "@test/issue-fixtures"
import { afterEach, describe, expect, test } from "bun:test"
import { Option, Schema } from "effect"

const team = { id: "team-1", key: "RAT", name: "Rata", timezone: "America/Los_Angeles" }

const dependent = {
  id: "i8",
  identifier: "RAT-8",
  title: "Dependent",
  state: { name: "Todo", type: "unstarted" },
}
const blocker = {
  id: "i9",
  identifier: "RAT-9",
  title: "Blocker",
  state: { name: "Done", type: "completed" },
}
const duplicate = {
  id: "i10",
  identifier: "RAT-10",
  title: "Duplicate",
  state: { name: "Backlog", type: "backlog" },
}
const original = {
  id: "i11",
  identifier: "RAT-11",
  title: "Original",
  state: { name: "Todo", type: "unstarted" },
}
const related = {
  id: "i12",
  identifier: "RAT-12",
  title: "Related",
  state: { name: "In Progress", type: "started" },
}
const relatedSource = {
  id: "i13",
  identifier: "RAT-13",
  title: "Related source",
  state: { name: "Todo", type: "unstarted" },
}
const similar = {
  id: "i14",
  identifier: "RAT-14",
  title: "Similar",
  state: { name: "Backlog", type: "backlog" },
}
const similarSource = {
  id: "i15",
  identifier: "RAT-15",
  title: "Similar source",
  state: { name: "Todo", type: "unstarted" },
}

const rowWithRelations = {
  ...summaryNode("RAT-1"),
  relations: {
    nodes: [
      { id: "rel-blocks", type: "blocks", relatedIssue: dependent },
      { id: "rel-duplicate", type: "duplicate", relatedIssue: duplicate },
      { id: "rel-related", type: "related", relatedIssue: related },
      { id: "rel-similar", type: "similar", relatedIssue: similar },
    ],
    pageInfo,
  },
  inverseRelations: {
    nodes: [
      { id: "inv-blocks", type: "blocks", issue: blocker },
      { id: "inv-duplicate", type: "duplicate", issue: original },
      { id: "inv-related", type: "related", issue: relatedSource },
      { id: "inv-similar", type: "similar", issue: similarSource },
    ],
    pageInfo,
  },
}

const relationsOf = () => ({
  blocks: [dependent],
  blockedBy: [blocker],
  duplicates: [duplicate],
  duplicatedBy: [original],
  related: [related, relatedSource],
  similar: [similar, similarSource],
})

const RelationChild = Schema.Struct({
  id: Schema.String,
  identifier: Schema.String,
  title: Schema.String,
  state: Schema.Struct({ name: Schema.String, type: Schema.String }),
})

const IssuePageDocument = Schema.Struct({
  issues: Schema.Array(
    Schema.Struct({
      identifier: Schema.String,
      relations: Schema.optional(
        Schema.Struct({
          blocks: Schema.Array(RelationChild),
          blockedBy: Schema.Array(RelationChild),
          duplicates: Schema.Array(RelationChild),
          duplicatedBy: Schema.Array(RelationChild),
          related: Schema.Array(RelationChild),
          similar: Schema.Array(RelationChild),
        }),
      ),
    }),
  ),
  pageInfo: Schema.Unknown,
})

const ErrorDocument = Schema.Struct({
  error: Schema.Struct({ code: Schema.String, hint: Schema.NullOr(Schema.String) }),
})

const pageOf = (lines: readonly string[]) =>
  Option.getOrThrow(Schema.decodeUnknownOption(IssuePageDocument)(lastJson(lines)))

const errorOf = (lines: readonly string[]) =>
  Option.getOrThrow(Schema.decodeUnknownOption(ErrorDocument)(lastJson(lines)))

const teamResponse = () => jsonResponse({ data: { teams: { nodes: [team], pageInfo } } })

const relationHandler =
  (rows: readonly Record<string, unknown>[], requests: ReturnType<typeof readBody>[]): Handler =>
  (request) => {
    const body = readBody(request)
    if (body.query.includes("query TeamByKey")) {
      return teamResponse()
    }
    requests.push(body)
    return jsonResponse({ data: { issues: { nodes: rows, pageInfo } } })
  }

afterEach(() => {
  process.exitCode = 0
})

describe("issue list --include relations", () => {
  test("adds every relation group to one request", async () => {
    const requests: ReturnType<typeof readBody>[] = []
    const lines: string[] = []

    await runIssue(
      relationHandler([rowWithRelations], requests),
      ["list", "--include", "relations", "--json"],
      lines,
    )

    const page = pageOf(lines)
    expect(page.issues.map((issue) => issue.identifier)).toEqual(["RAT-1"])
    expect(page.issues[0]?.relations).toEqual(relationsOf())
    expect(requests).toHaveLength(1)
    const listRequests = requests.filter((request) => request.query.includes("query IssueList"))
    expect(listRequests).toHaveLength(1)
    expect(listRequests[0]?.query).toContain("relations(")
    expect(listRequests[0]?.query).toContain("inverseRelations(")
  })

  test("caps each relation direction at the maximum page size", async () => {
    const requests: ReturnType<typeof readBody>[] = []
    const lines: string[] = []

    await runIssue(
      relationHandler([rowWithRelations], requests),
      ["list", "--include", "relations", "--json"],
      lines,
    )

    expect(requests).toHaveLength(1)
    expect(requests[0]?.query).toContain("relations(first: 250)")
    expect(requests[0]?.query).toContain("inverseRelations(first: 250)")
  })

  test("omits the relations key without the flag", async () => {
    const requests: ReturnType<typeof readBody>[] = []
    const lines: string[] = []

    await runIssue(relationHandler([summaryNode("RAT-1")], requests), ["list", "--json"], lines)

    const page = pageOf(lines)
    expect(page.issues[0]?.relations).toBeUndefined()
    expect(requests).toHaveLength(1)
    const listRequests = requests.filter((request) => request.query.includes("query IssueList"))
    expect(listRequests).toHaveLength(1)
    expect(listRequests[0]?.query).not.toContain("relations(")
    expect(listRequests[0]?.query).not.toContain("inverseRelations(")
  })

  test("rejects every include value except relations", async () => {
    const requests: ReturnType<typeof readBody>[] = []
    const lines: string[] = []

    await runIssue(
      relationHandler([summaryNode("RAT-1")], requests),
      ["list", "--include", "children", "--json"],
      lines,
    )

    const error = errorOf(lines)
    expect(error.error.code).toBe("validation")
    expect(error.error.hint).toContain("relations")
    expect(requests).toEqual([])
    expect(process.exitCode).toBe(2)
  })

  test("composes with --fields", async () => {
    const requests: ReturnType<typeof readBody>[] = []
    const lines: string[] = []

    await runIssue(
      relationHandler([rowWithRelations], requests),
      ["list", "--include", "relations", "--json", "--fields", "relations.blocks"],
      lines,
    )

    expect(lastJson(lines)).toEqual({
      issues: [{ relations: { blocks: [dependent] } }],
      pageInfo,
    })
  })

  test("composes with filters and --all", async () => {
    const requests: ReturnType<typeof readBody>[] = []
    const lines: string[] = []
    const handler: Handler = (request) => {
      const body = readBody(request)
      if (body.query.includes("query TeamByKey")) {
        return teamResponse()
      }
      if (body.query.includes("query IssueId")) {
        return jsonResponse({ data: { issue: { id: "parent-uuid" } } })
      }
      requests.push(body)
      const second = body.variables.after === "cursor-1"
      return jsonResponse({
        data: {
          issues: {
            nodes: [{ ...rowWithRelations, identifier: second ? "RAT-2" : "RAT-1" }],
            pageInfo: second
              ? { hasNextPage: false, endCursor: "cursor-2" }
              : { hasNextPage: true, endCursor: "cursor-1" },
          },
        },
      })
    }

    await runIssue(
      handler,
      ["list", "--parent", "RAT-0", "--unblocked", "--include", "relations", "--all", "--json"],
      lines,
    )

    const page = pageOf(lines)
    expect(page.issues.map((issue) => issue.identifier)).toEqual(["RAT-1", "RAT-2"])
    expect(page.issues.every((issue) => issue.relations !== undefined)).toBe(true)
    expect(requests).toHaveLength(2)
    expect(requests.every((request) => request.query.includes("inverseRelations("))).toBe(true)
    const unblocked = [
      { hasBlockedByRelations: { eq: false } },
      { state: { type: { nin: ["completed", "canceled"] } } },
    ]
    const filter = {
      and: [
        { team: { id: { eq: "team-1" } } },
        { parent: { id: { eq: "parent-uuid" } } },
        ...unblocked,
      ],
    }
    expect(requests.map((request) => request.variables)).toEqual([
      { filter, first: 50, after: null },
      { filter, first: 50, after: "cursor-1" },
    ])
  })
})
