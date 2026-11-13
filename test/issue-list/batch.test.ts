import type { Handler } from "@test/fake-linear/model"

import { lastJsonRecord, runIssue } from "@test/cli-harness"
import { jsonResponse, pageInfo, readBody, summaryNode, withTeamLookup } from "@test/issue-fixtures"
import { afterEach, describe, expect, test } from "bun:test"
import { Option, Schema } from "effect"

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
  return Option.isSome(decoded) ? decoded.value.map((issue) => issue.identifier) : []
}

const openBlocker = {
  id: "i9",
  identifier: "RAT-9",
  title: "Blocker",
  state: { name: "Todo", type: "unstarted" },
}

const missingRefHandler: Handler = () =>
  jsonResponse({ data: { issues: { nodes: [summaryNode("RAT-1")], pageInfo } } })

const partialPageHandler: Handler = () =>
  jsonResponse({
    data: {
      issues: {
        nodes: [summaryNode("RAT-1")],
        pageInfo: { hasNextPage: true, endCursor: "cursor-1" },
      },
    },
  })

const unexpectedRequestHandler: Handler = () => {
  throw new Error("a malformed ref must not reach the API")
}

afterEach(() => {
  process.exitCode = 0
})

describe("issue list --id", () => {
  test("reads a known set in one request and bypasses the linked team", async () => {
    const queries: string[] = []
    const variables: Record<string, unknown>[] = []
    const handler: Handler = (request) => {
      const body = readBody(request)
      queries.push(body.query)
      variables.push(body.variables)
      return jsonResponse({
        data: {
          issues: { nodes: [summaryNode("RAT-1"), summaryNode("RAT-2")], pageInfo },
        },
      })
    }

    const lines: string[] = []
    await runIssue(handler, ["list", "--id", "RAT-1", "--id", "RAT-2", "--json"], lines, [])

    expect(identifiersOf(lines)).toEqual(["RAT-1", "RAT-2"])
    expect(lastJsonRecord(lines).pageInfo).toEqual(pageInfo)
    expect(queries).toHaveLength(1)
    expect(queries[0]).toContain("query IssueList")
    expect(variables[0]?.filter).toEqual({ id: { in: ["RAT-1", "RAT-2"] } })
  })

  test("narrows by team and composes with relations and fields", async () => {
    const queries: string[] = []
    const variables: Record<string, unknown>[] = []
    const related = {
      ...summaryNode("RAT-1"),
      relations: { nodes: [], pageInfo },
      inverseRelations: {
        nodes: [{ id: "relation-1", type: "blocks", issue: openBlocker }],
        pageInfo,
      },
    }
    const handler = withTeamLookup((request) => {
      const body = readBody(request)
      queries.push(body.query)
      variables.push(body.variables)
      return jsonResponse({ data: { issues: { nodes: [related], pageInfo } } })
    })

    const lines: string[] = []
    await runIssue(
      handler,
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
      pageInfo,
    })
    expect(variables[0]?.filter).toEqual({
      and: [{ team: { id: { eq: "team-1" } } }, { id: { in: ["RAT-1"] } }],
    })
    expect(queries).toHaveLength(1)
  })

  test("returns not_found and names a missing ref", async () => {
    const lines: string[] = []
    await runIssue(
      missingRefHandler,
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
    const variables: Record<string, unknown>[] = []
    const handler: Handler = (request) => {
      const body = readBody(request)
      variables.push(body.variables)
      const first = body.variables.after === null
      return jsonResponse({
        data: {
          issues: {
            nodes: [summaryNode(first ? "RAT-1" : "RAT-2")],
            pageInfo: first ? { hasNextPage: true, endCursor: "cursor-1" } : pageInfo,
          },
        },
      })
    }

    const lines: string[] = []
    await runIssue(
      handler,
      ["list", "--id", "RAT-1", "--id", "RAT-2", "--all", "--json"],
      lines,
      [],
    )

    expect(identifiersOf(lines)).toEqual(["RAT-1", "RAT-2"])
    expect(lastJsonRecord(lines).pageInfo).toEqual(pageInfo)
    expect(variables).toHaveLength(2)
    expect(variables[0]?.filter).toEqual({ id: { in: ["RAT-1", "RAT-2"] } })
    expect(variables[1]?.filter).toEqual({ id: { in: ["RAT-1", "RAT-2"] } })
    expect(variables.map((item) => item.after)).toEqual([null, "cursor-1"])
  })

  test("turns a linear.app URL into an identifier", async () => {
    const variables: Record<string, unknown>[] = []
    const handler: Handler = (request) => {
      const body = readBody(request)
      variables.push(body.variables)
      return jsonResponse({ data: { issues: { nodes: [summaryNode("RAT-1")], pageInfo } } })
    }

    const lines: string[] = []
    await runIssue(
      handler,
      ["list", "--id", "https://linear.app/acme/issue/RAT-1/some-slug", "--json"],
      lines,
      [],
    )

    expect(identifiersOf(lines)).toEqual(["RAT-1"])
    expect(variables[0]?.filter).toEqual({ id: { in: ["RAT-1"] } })
  })

  test("does not report a missing ref on an incomplete page", async () => {
    const lines: string[] = []
    await runIssue(
      partialPageHandler,
      ["list", "--id", "RAT-1", "--id", "RAT-2", "--limit", "1", "--json"],
      lines,
      [],
    )

    expect(process.exitCode).toBe(0)
    expect(identifiersOf(lines)).toEqual(["RAT-1"])
    expect(lastJsonRecord(lines).pageInfo).toEqual({ hasNextPage: true, endCursor: "cursor-1" })
  })

  test("does not check refs on a continued page", async () => {
    const variables: Record<string, unknown>[] = []
    const handler: Handler = (request) => {
      const body = readBody(request)
      variables.push(body.variables)
      return jsonResponse({ data: { issues: { nodes: [summaryNode("RAT-2")], pageInfo } } })
    }

    const lines: string[] = []
    await runIssue(
      handler,
      ["list", "--id", "RAT-1", "--id", "RAT-2", "--after", "cursor-0", "--json"],
      lines,
      [],
    )

    expect(process.exitCode).toBe(0)
    expect(identifiersOf(lines)).toEqual(["RAT-2"])
    expect(variables[0]?.after).toBe("cursor-0")
  })

  test("rejects a malformed ref before any request", async () => {
    const lines: string[] = []
    await runIssue(unexpectedRequestHandler, ["list", "--id", "NOPE", "--json"], lines, [])

    expect(errorOf(lines).code).toBe("validation")
    expect(process.exitCode).toBe(2)
  })
})
