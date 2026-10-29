import { lastJson, runIssue } from "@test/cli-harness"
import { jsonResponse, pageInfo, summaryNode, viewer } from "@test/issue-fixtures"
import { makeRecorder } from "@test/issue-write/fixtures"
import { afterEach, describe, expect, test } from "bun:test"

import type { IssueInverseRelation, IssueRelation } from "@/api/issue-schema"

type WriteState = {
  readonly assignee: typeof viewer | null
  readonly labels: readonly { readonly id: string; readonly name: string }[]
  readonly outgoing: readonly IssueRelation[]
  readonly incoming: readonly IssueInverseRelation[]
}

const outgoingBlocks: IssueRelation = {
  id: "rel-out",
  type: "blocks",
  relatedIssue: {
    id: "i2",
    identifier: "RAT-2",
    title: "Dependent",
    state: { name: "Todo", type: "unstarted" },
  },
}

const state: WriteState = {
  assignee: viewer,
  labels: [{ id: "l1", name: "ready-for-agent" }],
  outgoing: [outgoingBlocks],
  incoming: [],
}

const issueIds: Readonly<Record<string, string>> = {
  "RAT-1": "i1",
  "RAT-2": "i2",
  "RAT-3": "i3",
  "RAT-9": "i9",
}

const recorderFor = (current: WriteState) =>
  makeRecorder((request) => {
    if (request.query.includes("query IssueSummary")) {
      return jsonResponse({
        data: {
          issue: {
            ...summaryNode("RAT-1"),
            assignee: current.assignee,
            labels: { nodes: current.labels },
          },
        },
      })
    }
    if (request.query.includes("query Viewer")) {
      return jsonResponse({ data: { viewer } })
    }
    if (request.query.includes("query IssueId")) {
      return jsonResponse({
        data: { issue: { id: issueIds[String(request.variables.id)] ?? "i9" } },
      })
    }
    if (request.query.includes("query IssueTeam")) {
      return jsonResponse({ data: { issue: { team: { id: "team-1" } } } })
    }
    if (request.query.includes("query IssueLabels")) {
      return jsonResponse({
        data: { issue: { labels: { nodes: current.labels, pageInfo } } },
      })
    }
    if (request.query.includes("query AvailableLabels")) {
      return jsonResponse({
        data: {
          issueLabels: {
            nodes: [
              { id: "l1", name: "ready-for-agent", color: "#111111" },
              { id: "l-bug", name: "bug", color: "#EB5757" },
            ],
            pageInfo,
          },
        },
      })
    }
    if (request.query.includes("query IssueRelations")) {
      return jsonResponse({
        data: { issue: { relations: { nodes: current.outgoing, pageInfo } } },
      })
    }
    if (request.query.includes("query IssueInverseRelations")) {
      return jsonResponse({
        data: { issue: { inverseRelations: { nodes: current.incoming, pageInfo } } },
      })
    }
    if (request.query.includes("mutation UpdateIssue")) {
      return jsonResponse({
        data: {
          issueUpdate: {
            success: true,
            issue: { ...summaryNode("RAT-1"), assignee: current.assignee },
          },
        },
      })
    }
    if (request.query.includes("mutation AddLabel")) {
      return jsonResponse({
        data: { issueAddLabel: { success: true, issue: summaryNode("RAT-1") } },
      })
    }
    if (request.query.includes("mutation RemoveLabel")) {
      return jsonResponse({
        data: { issueRemoveLabel: { success: true, issue: summaryNode("RAT-1") } },
      })
    }
    if (request.query.includes("mutation IssueRelationCreate")) {
      return jsonResponse({ data: { issueRelationCreate: { success: true } } })
    }
    if (request.query.includes("mutation IssueRelationDelete")) {
      return jsonResponse({ data: { issueRelationDelete: { success: true } } })
    }
    return jsonResponse({ errors: [{ message: `Unexpected query: ${request.query}` }] }, 400)
  })

afterEach(() => {
  process.exitCode = 0
})

describe("rata issue assign grammar", () => {
  test("accepts the ref first and the assignee as a flag", async () => {
    const recorder = recorderFor({ ...state, assignee: null })
    const lines: string[] = []
    await runIssue(recorder.handler, ["assign", "RAT-1", "--assignee", "me", "--json"], lines)
    expect(lastJson(lines)).toMatchObject({ dryRun: false, status: "updated" })
    expect(
      recorder.requests.some(
        (request) =>
          request.query.includes("mutation UpdateIssue") && request.variables.input !== undefined,
      ),
    ).toBe(true)
  })

  test("rejects the old assignee-first grammar with a hint", async () => {
    const recorder = recorderFor(state)
    const lines: string[] = []
    await runIssue(recorder.handler, ["assign", "me", "RAT-1"], lines)
    expect(lines).toContain("error: The issue reference comes before the assignee.")
    expect(lines).toContain("hint: rata issue assign RAT-1 --assignee me")
    expect(recorder.requests).toHaveLength(0)
    expect(process.exitCode).toBe(2)
  })

  test("requires --assignee", async () => {
    const recorder = recorderFor(state)
    const lines: string[] = []
    await runIssue(recorder.handler, ["assign", "RAT-1"], lines)
    expect(lines).toContain("error: The --assignee flag is required.")
    expect(lines).toContain("hint: rata issue assign <ref> --assignee <me|user-id|none>")
    expect(process.exitCode).toBe(2)
  })
})

describe("idempotent writes report skipped", () => {
  test("assign with the same assignee", async () => {
    const recorder = recorderFor(state)
    const lines: string[] = []
    await runIssue(recorder.handler, ["assign", "RAT-1", "--assignee", "me", "--json"], lines)
    expect(lastJson(lines)).toMatchObject({ status: "skipped" })
    expect(
      recorder.requests.some((request) => request.query.includes("mutation UpdateIssue")),
    ).toBe(false)
  })

  test("unassign when already unassigned", async () => {
    const recorder = recorderFor({ ...state, assignee: null })
    const lines: string[] = []
    await runIssue(recorder.handler, ["unassign", "RAT-1", "--json"], lines)
    expect(lastJson(lines)).toMatchObject({ status: "skipped" })
  })

  test("label add with a present label", async () => {
    const recorder = recorderFor(state)
    const lines: string[] = []
    await runIssue(recorder.handler, ["label", "add", "RAT-1", "ready-for-agent", "--json"], lines)
    expect(lastJson(lines)).toMatchObject({ status: "skipped" })
    expect(recorder.requests.some((request) => request.query.includes("mutation AddLabel"))).toBe(
      false,
    )
  })

  test("label remove with an absent label", async () => {
    const recorder = recorderFor(state)
    const lines: string[] = []
    await runIssue(recorder.handler, ["label", "remove", "RAT-1", "bug", "--json"], lines)
    expect(lastJson(lines)).toMatchObject({ status: "skipped" })
    expect(
      recorder.requests.some((request) => request.query.includes("mutation RemoveLabel")),
    ).toBe(false)
  })

  test("link with an existing relation", async () => {
    const recorder = recorderFor(state)
    const lines: string[] = []
    await runIssue(recorder.handler, ["link", "RAT-1", "--blocks", "RAT-2", "--json"], lines)
    expect(lastJson(lines)).toMatchObject({
      status: "skipped",
      relations: [{ action: "skipped", kind: "blocks", target: "RAT-2" }],
    })
    expect(
      recorder.requests.some((request) => request.query.includes("mutation IssueRelationCreate")),
    ).toBe(false)
  })

  test("unlink with a missing relation", async () => {
    const recorder = recorderFor(state)
    const lines: string[] = []
    await runIssue(recorder.handler, ["unlink", "RAT-1", "--blocks", "RAT-9", "--json"], lines)
    expect(lastJson(lines)).toMatchObject({
      status: "skipped",
      relations: [{ action: "skipped", kind: "blocks", target: "RAT-9" }],
    })
    expect(
      recorder.requests.some((request) => request.query.includes("mutation IssueRelationDelete")),
    ).toBe(false)
  })
})

const dryRuns: readonly {
  readonly args: readonly string[]
  readonly mutation: string
  readonly action: string
  readonly current?: WriteState
}[] = [
  {
    args: ["assign", "RAT-1", "--assignee", "me", "--dry-run", "--json"],
    mutation: "mutation UpdateIssue",
    action: "assign",
    current: { ...state, assignee: null },
  },
  {
    args: ["unassign", "RAT-1", "--dry-run", "--json"],
    mutation: "mutation UpdateIssue",
    action: "unassign",
  },
  {
    args: ["label", "add", "RAT-1", "bug", "--dry-run", "--json"],
    mutation: "mutation AddLabel",
    action: "add-label",
  },
  {
    args: ["label", "remove", "RAT-1", "ready-for-agent", "--dry-run", "--json"],
    mutation: "mutation RemoveLabel",
    action: "remove-label",
  },
  {
    args: ["link", "RAT-1", "--related", "RAT-9", "--dry-run", "--json"],
    mutation: "mutation IssueRelationCreate",
    action: "link",
  },
  {
    args: ["unlink", "RAT-1", "--blocks", "RAT-2", "--dry-run", "--json"],
    mutation: "mutation IssueRelationDelete",
    action: "unlink",
  },
]

describe("--dry-run", () => {
  for (const dryRun of dryRuns) {
    test(`${dryRun.action} resolves and writes nothing`, async () => {
      const recorder = recorderFor(dryRun.current ?? state)
      const lines: string[] = []
      await runIssue(recorder.handler, dryRun.args, lines)
      expect(lastJson(lines)).toMatchObject({
        dryRun: true,
        actions: [{ action: dryRun.action, status: "updated" }],
      })
      expect(recorder.requests.some((request) => request.query.includes(dryRun.mutation))).toBe(
        false,
      )
    })
  }
})
