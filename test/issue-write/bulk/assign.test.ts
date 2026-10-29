import { lastJson, runIssue } from "@test/cli-harness"
import { user } from "@test/issue-fixtures"
import { mutations, recorderFor, seed } from "@test/issue-write/bulk/fixtures"
import { afterEach, describe, expect, test } from "bun:test"

afterEach(() => {
  process.exitCode = 0
})

describe("bulk assign by parent", () => {
  test("assigns every child and drains every page", async () => {
    const recorder = recorderFor([seed("RAT-3"), seed("RAT-4")])
    const lines: string[] = []
    await runIssue(
      recorder.handler,
      ["assign", "--parent", "RAT-1", "--assignee", "me", "--json"],
      lines,
    )
    expect(lastJson(lines)).toMatchObject({
      dryRun: false,
      results: [
        { identifier: "RAT-3", status: "updated" },
        { identifier: "RAT-4", status: "updated" },
      ],
    })
    expect(mutations(recorder, "mutation UpdateIssue")).toHaveLength(2)
    expect(mutations(recorder, "query IssueChildrenSummary")).toHaveLength(2)
  })

  test("skips a child that already holds the assignee", async () => {
    const recorder = recorderFor([seed("RAT-3", { assignee: user })])
    const lines: string[] = []
    await runIssue(
      recorder.handler,
      ["assign", "--parent", "RAT-1", "--assignee", "me", "--json"],
      lines,
    )
    expect(lastJson(lines)).toMatchObject({
      results: [{ identifier: "RAT-3", status: "skipped" }],
    })
    expect(mutations(recorder, "mutation UpdateIssue")).toHaveLength(0)
  })

  test("reports a mid-batch failure and uses its exit code", async () => {
    const recorder = recorderFor([seed("RAT-3"), seed("RAT-4")], { failOn: "id-RAT-4" })
    const lines: string[] = []
    await runIssue(
      recorder.handler,
      ["assign", "--parent", "RAT-1", "--assignee", "me", "--json"],
      lines,
    )
    expect(lastJson(lines)).toMatchObject({
      results: [
        { identifier: "RAT-3", status: "updated" },
        { identifier: "RAT-4", status: "failed" },
      ],
    })
    expect(mutations(recorder, "mutation UpdateIssue")).toHaveLength(2)
    expect(process.exitCode).toBe(3)
  })

  test("dry-run resolves every child and writes nothing", async () => {
    const recorder = recorderFor([seed("RAT-3"), seed("RAT-4")])
    const lines: string[] = []
    await runIssue(
      recorder.handler,
      ["assign", "--parent", "RAT-1", "--assignee", "me", "--dry-run", "--json"],
      lines,
    )
    expect(lastJson(lines)).toMatchObject({
      dryRun: true,
      results: [
        { identifier: "RAT-3", status: "updated" },
        { identifier: "RAT-4", status: "updated" },
      ],
    })
    expect(mutations(recorder, "mutation UpdateIssue")).toHaveLength(0)
  })
})

describe("bulk target grammar", () => {
  test("requires a ref or --parent", async () => {
    const recorder = recorderFor([])
    const lines: string[] = []
    await runIssue(recorder.handler, ["assign", "--assignee", "me"], lines)
    expect(lines).toContain("error: An issue reference or --parent is required.")
    expect(recorder.requests).toHaveLength(0)
    expect(process.exitCode).toBe(2)
  })

  test("rejects a ref together with --parent", async () => {
    const recorder = recorderFor([seed("RAT-3")])
    const lines: string[] = []
    await runIssue(
      recorder.handler,
      ["assign", "RAT-2", "--parent", "RAT-1", "--assignee", "me"],
      lines,
    )
    expect(lines).toContain("error: The issue reference and --parent are mutually exclusive.")
    expect(recorder.requests).toHaveLength(0)
    expect(process.exitCode).toBe(2)
  })
})
