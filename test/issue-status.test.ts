import type { Captured } from "@test/issue-status/fixtures"

import { lastJson, lastJsonRecord, runRoot } from "@test/cli-harness"
import { summaryKeys, summaryNode, uuid } from "@test/issue-fixtures"
import {
  draft,
  errorEnvelope,
  linkAttachment,
  merged,
  missingIssueHandler,
  open,
  statusDetail,
  statusDocument,
  statusHandler,
  withoutMetadata,
} from "@test/issue-status/fixtures"
import { afterEach, describe, expect, test } from "bun:test"

afterEach(() => {
  process.exitCode = 0
})

describe("rata issue status", () => {
  test("projects every pull request and the blockers into JSON", async () => {
    const lines: string[] = []
    await runRoot(
      statusHandler(
        statusDetail([merged, open, draft, withoutMetadata, linkAttachment]),
        [summaryNode("RAT-114")],
        [],
      ),
      ["issue", "status", "RAT-1", "--json"],
      lines,
    )

    const document = statusDocument(lines)
    expect(Object.keys(lastJsonRecord(lines)).toSorted()).toEqual(
      [...summaryKeys, "blocked", "blockedBy", "nextChild", "prs"].toSorted(),
    )
    expect(document.identifier).toBe("RAT-1")
    expect(document.blocked).toBe(true)
    expect(document.blockedBy).toEqual([
      { identifier: "RAT-9", state: { name: "Todo", type: "unstarted" }, closed: false },
      { identifier: "RAT-10", state: { name: "Done", type: "completed" }, closed: true },
    ])
    expect(document.prs.map((pull) => pull.number)).toEqual([25, 26, 27, null])
    expect(document.prs.map((pull) => pull.repo)).toEqual([
      "eyenalxai/rata",
      "eyenalxai/rata",
      "eyenalxai/rata",
      null,
    ])
    expect(document.prs.map((pull) => pull.status)).toEqual(["merged", "open", "open", null])
    expect(document.prs[2]?.draft).toBe(true)
    expect(document.prs[3]).toMatchObject({
      status: null,
      repo: null,
      checks: null,
      mergeCommit: null,
    })
    expect(document.nextChild?.identifier).toBe("RAT-114")
  })

  test("renders the merged, open, draft and missing pull requests", async () => {
    const lines: string[] = []
    await runRoot(
      statusHandler(statusDetail([merged, open, draft, withoutMetadata, linkAttachment]), [], []),
      ["issue", "status", "RAT-1"],
      lines,
    )

    const output = lines.join("\n")
    expect(output).toContain("blocked: yes")
    expect(output).toContain("open blockers:")
    expect(output).toContain("RAT-9")
    expect(output).not.toContain("RAT-10")
    expect(output).toContain("#25  merged  eyenalxai/rata")
    expect(output).toContain("#26  open  eyenalxai/rata")
    expect(output).toContain("#27  draft  eyenalxai/rata")
    expect(output).toContain("unknown")
    expect(output).toContain("next child: none")
  })

  test("renders no pull request without an error", async () => {
    const lines: string[] = []
    await runRoot(
      statusHandler(statusDetail([linkAttachment]), [], []),
      ["issue", "status", "RAT-1"],
      lines,
    )

    expect(lines.join("\n")).toContain("prs: none")
  })

  test("selects fields from the flat status object", async () => {
    const lines: string[] = []
    await runRoot(
      statusHandler(statusDetail([]), [summaryNode("RAT-114")], []),
      ["issue", "status", "RAT-1", "--json", "--fields", "identifier,blocked,nextChild.identifier"],
      lines,
    )

    expect(lastJson(lines)).toEqual({
      identifier: "RAT-1",
      blocked: true,
      nextChild: { identifier: "RAT-114" },
    })
  })

  test("picks the next child without the assignee filter", async () => {
    const captured: Captured = []
    const lines: string[] = []
    await runRoot(
      statusHandler(statusDetail([]), [summaryNode("RAT-114")], captured),
      ["issue", "status", "RAT-1", "--json"],
      lines,
    )

    expect(statusDocument(lines).nextChild?.identifier).toBe("RAT-114")
    expect(captured).toHaveLength(1)
    expect(JSON.stringify(captured[0]?.filter)).not.toContain("assignee")
    expect(JSON.stringify(captured[0]?.filter)).toContain("hasBlockedByRelations")
  })

  test("reads the next child from the issue team without a repository link", async () => {
    const captured: Captured = []
    const lines: string[] = []
    await runRoot(
      statusHandler(statusDetail([]), [summaryNode("RAT-114")], captured),
      ["issue", "status", "RAT-1", "--json"],
      lines,
      [],
    )

    expect(statusDocument(lines).nextChild?.identifier).toBe("RAT-114")
    expect(JSON.stringify(captured[0]?.filter)).toContain(`"team":{"id":{"eq":"${uuid}"}}`)
  })

  test("exits 3 when the issue is missing", async () => {
    const lines: string[] = []
    await runRoot(missingIssueHandler, ["issue", "status", "RAT-404", "--json"], lines)

    expect(errorEnvelope(lines).error.code).toBe("not_found")
    expect(process.exitCode).toBe(3)
  })
})
