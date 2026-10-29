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

const PullRequest = Schema.Struct({
  number: Schema.NullOr(Schema.Finite),
  repo: Schema.NullOr(Schema.String),
  url: Schema.String,
  status: Schema.NullOr(Schema.String),
  draft: Schema.NullOr(Schema.Boolean),
  source: Schema.Literal("linear"),
  checks: Schema.Null,
  mergeCommit: Schema.Null,
})

const StatusDocument = Schema.Struct({
  issue: Schema.Struct({
    identifier: Schema.String,
    state: Schema.Struct({ name: Schema.String, type: Schema.String }),
    priority: Schema.String,
  }),
  blocked: Schema.Boolean,
  blockedBy: Schema.Array(
    Schema.Struct({
      identifier: Schema.String,
      state: Schema.Struct({ name: Schema.String, type: Schema.String }),
      closed: Schema.Boolean,
    }),
  ),
  prs: Schema.Array(PullRequest),
  nextChild: Schema.NullOr(Schema.Struct({ identifier: Schema.String })),
})

const ErrorEnvelope = Schema.Struct({
  error: Schema.Struct({ code: Schema.String, hint: Schema.NullOr(Schema.String) }),
})

const statusDocument = (lines: readonly string[]) =>
  Option.getOrThrow(Schema.decodeUnknownOption(StatusDocument)(lastJson(lines)))

const errorEnvelope = (lines: readonly string[]) =>
  Option.getOrThrow(Schema.decodeUnknownOption(ErrorEnvelope)(lastJson(lines)))

const prAttachment = (id: string, number: number, metadata: Record<string, unknown>) => ({
  id,
  title: `Pull request ${number}`,
  subtitle: "eyenalxai/rata",
  url: `https://github.com/eyenalxai/rata/pull/${number}`,
  sourceType: "github",
  createdAt: "2026-01-02T08:00:00.000Z",
  metadata,
})

const merged = prAttachment("pr-25", 25, {
  number: 25,
  repo: "eyenalxai/rata",
  status: "merged",
  draft: false,
  reviews: 2,
  hasConflicts: false,
  mergedAt: "2026-01-03T10:00:00.000Z",
  closedAt: "2026-01-03T10:00:00.000Z",
})

const open = prAttachment("pr-26", 26, {
  number: 26,
  repoLogin: "eyenalxai",
  repoName: "rata",
  status: "open",
})

const draft = prAttachment("pr-27", 27, {
  number: 27,
  repo: "eyenalxai/rata",
  status: "open",
  draft: true,
})

const withoutMetadata = {
  id: "pr-unknown",
  title: "Pull request without metadata",
  subtitle: "eyenalxai/rata",
  url: "https://github.com/eyenalxai/rata/pull/28",
  sourceType: "github",
  createdAt: "2026-01-02T08:00:00.000Z",
}

const linkAttachment = {
  id: "link-1",
  title: "Design doc",
  subtitle: "Notion",
  url: "https://example.com/doc",
  sourceType: "link",
  createdAt: "2026-01-02T08:00:00.000Z",
}

const openBlocker = {
  id: "i9",
  identifier: "RAT-9",
  title: "Open blocker",
  state: { name: "Todo", type: "unstarted" },
}

const closedBlocker = {
  id: "i10",
  identifier: "RAT-10",
  title: "Closed blocker",
  state: { name: "Done", type: "completed" },
}

const statusDetail = (attachments: readonly unknown[]) => ({
  ...baseDetail,
  inverseRelations: {
    nodes: [openBlocker, closedBlocker].map((issue, index) => ({
      id: `relation-${index}`,
      type: "blocks",
      issue,
    })),
    pageInfo,
  },
  attachments: { nodes: attachments, pageInfo },
})

type Captured = Record<string, unknown>[]

const statusHandler = (detail: unknown, nextChild: unknown, captured: Captured): Handler =>
  withTeamLookup((request) => {
    const body = readBody(request)
    if (body.query.includes("query IssueShow")) {
      return jsonResponse({ data: { issue: detail } })
    }
    if (body.query.includes("query IssueId")) {
      return jsonResponse({ data: { issue: { id: "parent-1" } } })
    }
    if (body.query.includes("query IssueList")) {
      captured.push(body.variables)
      return jsonResponse({
        data: { issues: { nodes: nextChild === null ? [] : [nextChild], pageInfo } },
      })
    }
    return jsonResponse({ errors: [{ message: `Unexpected query: ${body.query}` }] }, 400)
  })

const missingIssueHandler: Handler = () =>
  jsonResponse({ data: null, errors: [{ message: "Entity not found" }] })

afterEach(() => {
  process.exitCode = 0
})

describe("rata issue status", () => {
  test("projects every pull request and the blockers into JSON", async () => {
    const lines: string[] = []
    await runRoot(
      statusHandler(
        statusDetail([merged, open, draft, withoutMetadata, linkAttachment]),
        summaryNode("RAT-114"),
        [],
      ),
      ["issue", "status", "RAT-1", "--json"],
      lines,
    )

    const document = statusDocument(lines)
    expect(document.issue.identifier).toBe("RAT-1")
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
      statusHandler(statusDetail([merged, open, draft, withoutMetadata, linkAttachment]), null, []),
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
      statusHandler(statusDetail([linkAttachment]), null, []),
      ["issue", "status", "RAT-1"],
      lines,
    )

    expect(lines.join("\n")).toContain("prs: none")
  })

  test("picks the next child without the assignee filter", async () => {
    const captured: Captured = []
    const lines: string[] = []
    await runRoot(
      statusHandler(statusDetail([]), summaryNode("RAT-114"), captured),
      ["issue", "status", "RAT-1", "--json"],
      lines,
    )

    expect(statusDocument(lines).nextChild?.identifier).toBe("RAT-114")
    expect(captured).toHaveLength(1)
    expect(JSON.stringify(captured[0]?.filter)).not.toContain("assignee")
    expect(JSON.stringify(captured[0]?.filter)).toContain("hasBlockedByRelations")
  })

  test("exits 3 when the issue is missing", async () => {
    const lines: string[] = []
    await runRoot(missingIssueHandler, ["issue", "status", "RAT-404", "--json"], lines)

    expect(errorEnvelope(lines).error.code).toBe("not_found")
    expect(process.exitCode).toBe(3)
  })
})
