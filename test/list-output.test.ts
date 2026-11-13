import type { Handler } from "@test/fake-linear/model"

import { lastJson, runRoot } from "@test/cli-harness"
import { jsonResponse, readBody, summaryNode, withTeamLookup } from "@test/issue-fixtures"
import { afterEach, describe, expect, test } from "bun:test"

const firstNode = summaryNode("RAT-1")
const secondNode = summaryNode("RAT-2")
const thirdNode = summaryNode("RAT-3")
const nodes = [firstNode, secondNode, thirdNode]

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value)

const idFilter = (filter: unknown): readonly string[] | undefined => {
  if (!isRecord(filter) || !isRecord(filter.id)) {
    return undefined
  }
  const ids = filter.id.in
  return Array.isArray(ids) && ids.every((id) => typeof id === "string") ? ids : undefined
}

const pagedHandler =
  (
    items: readonly ReturnType<typeof summaryNode>[],
    captured: Record<string, unknown>[],
  ): Handler =>
  (request) => {
    const body = readBody(request)
    if (body.query.includes("query IssueId")) {
      return jsonResponse({ data: { issue: { id: `id-${String(body.variables.id)}` } } })
    }
    captured.push(body.variables)
    const ids = idFilter(body.variables.filter)
    const matching =
      ids === undefined
        ? items
        : items.filter((item) => ids.includes(item.id) || ids.includes(item.identifier))
    const first = typeof body.variables.first === "number" ? body.variables.first : 50
    const after = typeof body.variables.after === "string" ? body.variables.after : null
    const start = after === null ? 0 : matching.findIndex((item) => item.id === after) + 1
    const page = matching.slice(start, start + first)
    const last = page.at(-1)
    const connection = {
      nodes: page,
      pageInfo: {
        hasNextPage: start + page.length < matching.length,
        endCursor: last?.id ?? null,
      },
    }
    return jsonResponse({
      data: body.query.includes("query IssueSearch")
        ? { searchIssues: connection }
        : { issues: connection },
    })
  }

const handler = (captured: Record<string, unknown>[] = []): Handler =>
  withTeamLookup(pagedHandler(nodes, captured))

afterEach(() => {
  process.exitCode = 0
})

describe("issue list output flags", () => {
  test("prints one integer and drains every page with --limit as the page size", async () => {
    const captured: Record<string, unknown>[] = []
    const lines: string[] = []
    await runRoot(handler(captured), ["issue", "list", "--count", "--limit", "2"], lines)

    expect(lines).toEqual(["3"])
    expect(captured).toHaveLength(2)
    expect(captured[0]).toMatchObject({ first: 2, after: null })
    expect(captured[1]).toMatchObject({ first: 2, after: "id-RAT-2" })
  })

  test("prints a count document with --json", async () => {
    const lines: string[] = []
    await runRoot(handler(), ["issue", "list", "--count", "--limit", "2", "--json"], lines)

    expect(lastJson(lines)).toEqual({ count: 3 })
  })

  test("honors --after and accepts --all", async () => {
    const captured: Record<string, unknown>[] = []
    const lines: string[] = []
    await runRoot(
      handler(captured),
      ["issue", "list", "--count", "--after", "id-RAT-1", "--all"],
      lines,
    )

    expect(lines).toEqual(["2"])
    expect(captured[0]).toMatchObject({ first: 50, after: "id-RAT-1" })
  })

  test("composes with --id for the count and the identifier output", async () => {
    const countLines: string[] = []
    await runRoot(
      handler(),
      ["issue", "list", "--id", "RAT-1", "--id", "RAT-3", "--count"],
      countLines,
    )
    expect(countLines).toEqual(["2"])

    const idLines: string[] = []
    await runRoot(handler(), ["issue", "list", "--id", "RAT-3", "--ids-only"], idLines)
    expect(idLines).toEqual(["RAT-3"])
  })

  test("prints one identifier per line in page order and composes with --all", async () => {
    const captured: Record<string, unknown>[] = []
    const lines: string[] = []
    await runRoot(
      handler(captured),
      ["issue", "list", "--ids-only", "--all", "--limit", "2"],
      lines,
    )

    expect(lines).toEqual(["RAT-1", "RAT-2", "RAT-3"])
    expect(captured).toHaveLength(2)
  })
})

describe("search output flags", () => {
  const ranked = [secondNode, firstNode, thirdNode]

  test("prints one identifier per line in relevance order", async () => {
    const lines: string[] = []
    await runRoot(
      withTeamLookup(pagedHandler(ranked, [])),
      ["search", "rate limit", "--ids-only", "--limit", "2"],
      lines,
    )

    expect(lines).toEqual(["RAT-2", "RAT-1"])
  })

  test("drains every page for --count", async () => {
    const captured: Record<string, unknown>[] = []
    const lines: string[] = []
    await runRoot(
      withTeamLookup(pagedHandler(ranked, captured)),
      ["search", "rate limit", "--count", "--limit", "2"],
      lines,
    )

    expect(lines).toEqual(["3"])
    expect(captured).toHaveLength(2)
    expect(captured[1]).toMatchObject({ first: 2, after: "id-RAT-1" })
  })
})

describe("next identifier output", () => {
  test("prints the ready identifier", async () => {
    const lines: string[] = []
    await runRoot(handler(), ["next", "--parent", "RAT-7", "--ids-only"], lines)

    expect(lines).toEqual(["RAT-1"])
    expect(process.exitCode).toBe(0)
  })

  test("prints nothing and exits 0 at an empty frontier", async () => {
    const lines: string[] = []
    await runRoot(
      withTeamLookup(pagedHandler([], [])),
      ["next", "--parent", "RAT-7", "--ids-only"],
      lines,
    )

    expect(lines).toEqual([])
    expect(process.exitCode).toBe(0)
  })
})

describe("list output validation", () => {
  const cases: readonly [string, readonly string[], string][] = [
    [
      "count with ids-only",
      ["issue", "list", "--count", "--ids-only"],
      "The --count and --ids-only flags cannot be combined.",
    ],
    [
      "count with fields",
      ["issue", "list", "--count", "--fields", "identifier", "--json"],
      "The --count flag is not valid with --fields.",
    ],
    [
      "ids-only with json",
      ["issue", "list", "--ids-only", "--json"],
      "The --ids-only flag prints plain text and is not valid with --json or --fields.",
    ],
    [
      "ids-only with fields",
      ["issue", "list", "--ids-only", "--fields", "identifier"],
      "The --ids-only flag prints plain text and is not valid with --json or --fields.",
    ],
  ]

  for (const [name, args, message] of cases) {
    test(`rejects ${name}`, async () => {
      const captured: Record<string, unknown>[] = []
      const lines: string[] = []
      await runRoot(handler(captured), args, lines)

      if (args.includes("--json")) {
        expect(lastJson(lines)).toMatchObject({ error: { code: "validation", message } })
      } else {
        expect(lines[0]).toBe(`error: ${message}`)
      }
      expect(captured).toEqual([])
      expect(process.exitCode).toBe(2)
    })
  }

  test("rejects ids-only with json on next", async () => {
    const captured: Record<string, unknown>[] = []
    const lines: string[] = []
    await runRoot(handler(captured), ["next", "--parent", "RAT-7", "--ids-only", "--json"], lines)

    expect(lastJson(lines)).toMatchObject({
      error: {
        code: "validation",
        message: "The --ids-only flag prints plain text and is not valid with --json or --fields.",
      },
    })
    expect(captured).toEqual([])
    expect(process.exitCode).toBe(2)
  })
})
