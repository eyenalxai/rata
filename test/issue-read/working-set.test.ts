import { runIssueMemory } from "@test/cli-harness"
import { documentOf, label, pullRequest, ready, seed } from "@test/issue-read/fixtures"
import { afterEach, describe, expect, test } from "bun:test"

import { commentId } from "@/domain/id"

afterEach(() => {
  process.exitCode = 0
})

describe("issue <ref>", () => {
  test("returns the working set with sections, blockers, PRs, children and the frontier", async () => {
    const lines: string[] = []
    await runIssueMemory(seed(), ["RAT-1", "--format", "json"], lines)

    const issue = documentOf(lines)
    expect(issue.comments).toBeNull()
    expect(issue.description).toBe("# Destination\nShip the read.\n\n## Notes\nA note.")
    expect(issue.sections).toEqual([
      {
        heading: "Destination",
        level: 1,
        content: "Ship the read.\n\n## Notes\nA note.",
        line: 1,
      },
      { heading: "Notes", level: 2, content: "A note.", line: 4 },
    ])
    expect(issue.blocked).toBe(true)
    expect(issue.blockedBy).toEqual([
      {
        identifier: "RAT-9",
        title: "Blocker",
        state: { name: "Todo", type: "unstarted" },
        closed: false,
      },
    ])
    expect(issue.prs).toEqual([
      expect.objectContaining({
        number: 42,
        repo: "acme/rata",
        url: pullRequest.url,
        checks: null,
      }),
    ])
    expect(issue.children).toEqual([
      expect.objectContaining({ identifier: "RAT-2", blocked: false }),
      expect.objectContaining({ identifier: "RAT-6", blocked: false }),
      expect.objectContaining({ identifier: "RAT-3", blocked: true }),
      expect.objectContaining({ identifier: "RAT-4", blocked: false }),
      expect.objectContaining({ identifier: "RAT-5", blocked: false }),
    ])
    expect(issue.frontier).toEqual([
      expect.objectContaining({ identifier: "RAT-2" }),
      expect.objectContaining({ identifier: "RAT-6" }),
    ])
    expect(issue.nextChild).toEqual(expect.objectContaining({ identifier: "RAT-2" }))
    expect(issue).not.toHaveProperty("url")
    expect(issue).not.toHaveProperty("labels")
  })

  test("reads the working set without a repository link", async () => {
    const lines: string[] = []
    await runIssueMemory(seed(), ["RAT-1", "--format", "json"], lines, [])

    expect(documentOf(lines).identifier).toBe("RAT-1")
  })

  test("adds comments only with --comments", async () => {
    const without: string[] = []
    await runIssueMemory(seed(), ["RAT-1", "--format", "json"], without)
    expect(documentOf(without).comments).toBeNull()

    const withComments: string[] = []
    await runIssueMemory(seed(), ["RAT-1", "--comments", "--format", "json"], withComments)
    expect(documentOf(withComments).comments).toEqual([
      expect.objectContaining({ id: commentId("c1"), body: "First comment" }),
    ])
  })

  test("--summary returns the header fields only", async () => {
    const lines: string[] = []
    await runIssueMemory(seed(), ["RAT-1", "--summary", "--format", "json"], lines)

    expect(Object.keys(documentOf(lines)).toSorted()).toEqual([
      "assignee",
      "id",
      "identifier",
      "parent",
      "priority",
      "project",
      "state",
      "title",
    ])
  })

  test("--full adds labels, URLs, timestamps, relations and full child rows", async () => {
    const lines: string[] = []
    await runIssueMemory(seed(), ["RAT-1", "--full", "--format", "json"], lines)

    const issue = documentOf(lines)
    expect(issue.url).toBe("https://linear.app/acme/issue/RAT-1/the-map")
    expect(issue.labels).toEqual([label])
    expect(issue.createdAt).toBe("2026-01-01T00:00:00.000Z")
    expect(issue.relations).toEqual(
      expect.objectContaining({
        blocks: [expect.objectContaining({ identifier: "RAT-6" })],
        blockedBy: [expect.objectContaining({ identifier: "RAT-9" })],
      }),
    )
    expect(issue.children).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ identifier: "RAT-2", url: ready.summary.url, labels: [label] }),
      ]),
    )
  })
})
