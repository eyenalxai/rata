import type { Captured } from "@test/issue-status/fixtures"

import { runRoot } from "@test/cli-harness"
import {
  childRow,
  errorEnvelope,
  openBlocker,
  statusDetail,
  statusDocument,
  statusHandler,
} from "@test/issue-status/fixtures"
import { afterEach, describe, expect, test } from "bun:test"

afterEach(() => {
  process.exitCode = 0
})

describe("rata issue status session read", () => {
  test("reads the issue and the next child in two requests", async () => {
    const queries: string[] = []
    const lines: string[] = []
    await runRoot(
      statusHandler(statusDetail([]), [], [], queries),
      ["issue", "status", "RAT-1", "--json"],
      lines,
    )

    expect(queries).toHaveLength(2)
    expect(queries.filter((query) => query.includes("query IssueShow"))).toHaveLength(1)
    expect(queries.filter((query) => query.includes("query IssueList"))).toHaveLength(1)
    expect(queries.some((query) => query.includes("query IssueId"))).toBe(false)
  })

  test("adds the description without another request", async () => {
    const queries: string[] = []
    const lines: string[] = []
    await runRoot(
      statusHandler(statusDetail([]), [], [], queries),
      ["issue", "status", "RAT-1", "--json", "--with-body"],
      lines,
    )

    expect(statusDocument(lines).description).toBe("Body")
    expect(queries).toHaveLength(2)
  })

  test("rejects description in --fields without --with-body", async () => {
    const lines: string[] = []
    await runRoot(
      statusHandler(statusDetail([]), [], []),
      ["issue", "status", "RAT-1", "--json", "--fields", "description"],
      lines,
    )

    const error = errorEnvelope(lines)
    expect(error.error.code).toBe("validation")
    expect(error.error.message).toBe("Unknown field path: description.")
    expect(process.exitCode).toBe(2)
  })

  test("adds the comments with one extra request", async () => {
    const queries: string[] = []
    const lines: string[] = []
    await runRoot(
      statusHandler(statusDetail([]), [], [], queries),
      ["issue", "status", "RAT-1", "--json", "--comments"],
      lines,
    )

    expect(statusDocument(lines).comments?.map((item) => item.id)).toEqual(["c1"])
    expect(queries.filter((query) => query.includes("query IssueComments"))).toHaveLength(1)
    expect(queries).toHaveLength(3)
  })

  test("includes every child and computes the next child from them", async () => {
    const captured: Captured = []
    const queries: string[] = []
    const children = [
      childRow("RAT-2", 1, { name: "Todo", type: "unstarted" }, [openBlocker]),
      childRow("RAT-3", 2, { name: "Done", type: "completed" }, []),
      childRow("RAT-4", 4, { name: "Todo", type: "unstarted" }, []),
    ]
    const lines: string[] = []
    await runRoot(
      statusHandler(statusDetail([]), children, captured, queries),
      ["issue", "status", "RAT-1", "--json", "--children"],
      lines,
    )

    const document = statusDocument(lines)
    expect(document.nextChild?.identifier).toBe("RAT-4")
    expect(document.children?.map((child) => child.identifier)).toEqual(["RAT-2", "RAT-3", "RAT-4"])
    expect(document.children?.[0]?.blocked).toBe(true)
    expect(document.children?.[0]?.blockedBy).toEqual([{ identifier: "RAT-9" }])
    expect(document.children?.[1]?.blocked).toBe(false)
    expect(queries).toHaveLength(2)
    expect(JSON.stringify(captured[0]?.filter)).not.toContain("hasBlockedByRelations")
    expect(queries.some((query) => query.includes("inverseRelations"))).toBe(true)
  })
})
