import { lastJson, runIssue } from "@test/cli-harness"
import { jsonResponse, pageInfo, summaryNode } from "@test/issue-fixtures"
import { labels, mutations, recorderFor, seed } from "@test/issue-write/bulk/fixtures"
import { makeRecorder } from "@test/issue-write/fixtures"
import { afterEach, describe, expect, test } from "bun:test"
import { Result } from "effect"

import { parseLabelTarget } from "@/cli/issue-label"

afterEach(() => {
  process.exitCode = 0
})

describe("parseLabelTarget", () => {
  test("reads the first positional as the ref without --parent", () => {
    expect(Result.getOrThrow(parseLabelTarget("add", undefined, ["RAT-1", "bug"]))).toEqual({
      kind: "single",
      ref: "RAT-1",
      labels: ["bug"],
    })
  })

  test("reads every positional as a label with --parent", () => {
    expect(Result.getOrThrow(parseLabelTarget("add", "RAT-1", ["bug", "enhancement"]))).toEqual({
      kind: "bulk",
      parent: "RAT-1",
      labels: ["bug", "enhancement"],
    })
  })

  test("requires a label with --parent", () => {
    expect(Result.isFailure(parseLabelTarget("remove", "RAT-1", []))).toBe(true)
  })

  test("requires a ref and a label without --parent", () => {
    expect(Result.isFailure(parseLabelTarget("add", undefined, []))).toBe(true)
    expect(Result.isFailure(parseLabelTarget("add", undefined, ["RAT-1"]))).toBe(true)
  })
})

describe("bulk labels by parent", () => {
  test("treats every positional as a label with --parent", async () => {
    const recorder = recorderFor([seed("RAT-3")])
    const lines: string[] = []
    await runIssue(recorder.handler, ["label", "add", "--parent", "RAT-1", "bug", "--json"], lines)
    expect(lastJson(lines)).toMatchObject({
      results: [{ identifier: "RAT-3", status: "updated" }],
    })
    const [request] = mutations(recorder, "mutation AddLabel")
    expect(request?.variables.labelId).toBe("l-bug")
    expect(request?.variables.id).toBe("id-RAT-3")
  })

  test("adds several labels to every child", async () => {
    const recorder = recorderFor([seed("RAT-3"), seed("RAT-4")])
    const lines: string[] = []
    await runIssue(
      recorder.handler,
      ["label", "add", "--parent", "RAT-1", "bug", "enhancement", "--json"],
      lines,
    )
    expect(lastJson(lines)).toMatchObject({
      results: [
        { identifier: "RAT-3", status: "updated" },
        { identifier: "RAT-4", status: "updated" },
      ],
    })
    expect(mutations(recorder, "mutation AddLabel")).toHaveLength(4)
  })

  test("skips a label that the child already has", async () => {
    const recorder = recorderFor([seed("RAT-3", { labels: [labels.bug] })])
    const lines: string[] = []
    await runIssue(recorder.handler, ["label", "add", "--parent", "RAT-1", "bug", "--json"], lines)
    expect(lastJson(lines)).toMatchObject({
      results: [{ identifier: "RAT-3", status: "skipped" }],
    })
    expect(mutations(recorder, "mutation AddLabel")).toHaveLength(0)
  })

  test("resolves labels for each child team", async () => {
    const recorder = makeRecorder((request) => {
      if (request.query.includes("query TeamById") || request.query.includes("query TeamByKey")) {
        const teams = [
          { id: "team-1", key: "RAT", name: "Rata", timezone: "America/Los_Angeles" },
          { id: "team-2", key: "OPS", name: "Operations", timezone: "America/New_York" },
        ]
        const id = request.variables.id
        const key = request.variables.key
        return jsonResponse({
          data: {
            teams: {
              nodes: teams.filter((team) => (id === undefined ? team.key === key : team.id === id)),
              pageInfo,
            },
          },
        })
      }
      if (request.query.includes("query TeamStates")) {
        return jsonResponse({ data: { team: { states: { nodes: [], pageInfo } } } })
      }
      if (request.query.includes("query TeamLabels")) {
        const teamId = request.variables.teamId
        const labelId = teamId === "team-2" ? "l-bug-ops" : "l-bug"
        return jsonResponse({
          data: {
            issueLabels: {
              nodes: [{ id: labelId, name: "bug", color: "#EB5757", team: { id: teamId } }],
              pageInfo,
            },
          },
        })
      }
      if (request.query.includes("query TeamMembers")) {
        return jsonResponse({ data: { team: { members: { nodes: [], pageInfo } } } })
      }
      if (request.query.includes("query IssuePriorityValues")) {
        return jsonResponse({ data: { issuePriorityValues: [] } })
      }
      if (request.query.includes("query IssueId")) {
        return jsonResponse({ data: { issue: { id: "i-parent" } } })
      }
      if (request.query.includes("query IssueChildrenSummary")) {
        const after = request.variables.after
        const index = typeof after === "string" ? Number(after.replace("cursor-", "")) : 0
        const children = [
          { identifier: "RAT-3", teamId: "team-1" },
          { identifier: "RAT-4", teamId: "team-2" },
        ]
        const child = children[index]
        const hasNextPage = index + 1 < children.length
        return jsonResponse({
          data: {
            issue: {
              children: {
                nodes:
                  child === undefined
                    ? []
                    : [
                        {
                          ...summaryNode(child.identifier),
                          id: `id-${child.identifier}`,
                          labels: { nodes: [] },
                          team: { id: child.teamId },
                        },
                      ],
                pageInfo: { hasNextPage, endCursor: hasNextPage ? `cursor-${index + 1}` : null },
              },
            },
          },
        })
      }
      if (request.query.includes("mutation AddLabel")) {
        return jsonResponse({
          data: {
            issueAddLabel: {
              success: true,
              issue: summaryNode(String(request.variables.id).replace("id-", "")),
            },
          },
        })
      }
      return jsonResponse({ errors: [{ message: `Unexpected query: ${request.query}` }] }, 400)
    })
    const lines: string[] = []
    await runIssue(recorder.handler, ["label", "add", "--parent", "RAT-1", "bug", "--json"], lines)
    expect(lastJson(lines)).toMatchObject({
      results: [
        { identifier: "RAT-3", status: "updated" },
        { identifier: "RAT-4", status: "updated" },
      ],
    })
    const writes = mutations(recorder, "mutation AddLabel")
    expect(writes.map((request) => request.variables)).toEqual([
      { id: "id-RAT-3", labelId: "l-bug" },
      { id: "id-RAT-4", labelId: "l-bug-ops" },
    ])
  })

  test("aborts the whole batch when a label is missing", async () => {
    const recorder = recorderFor([seed("RAT-3"), seed("RAT-4")])
    const lines: string[] = []
    await runIssue(recorder.handler, ["label", "add", "--parent", "RAT-1", "nope", "--json"], lines)
    expect(lines.join("\n")).toContain('"code": "not_found"')
    expect(mutations(recorder, "mutation AddLabel")).toHaveLength(0)
    expect(process.exitCode).toBe(3)
  })

  test("reports a mid-batch failure and exits 3", async () => {
    const recorder = recorderFor([seed("RAT-3"), seed("RAT-4")], { failOn: "id-RAT-4" })
    const lines: string[] = []
    await runIssue(recorder.handler, ["label", "add", "--parent", "RAT-1", "bug", "--json"], lines)
    expect(lastJson(lines)).toMatchObject({
      results: [
        { identifier: "RAT-3", status: "updated" },
        { identifier: "RAT-4", status: "failed" },
      ],
    })
    expect(process.exitCode).toBe(3)
  })

  test("dry-run reports the labels without writing", async () => {
    const recorder = recorderFor([seed("RAT-3")])
    const lines: string[] = []
    await runIssue(
      recorder.handler,
      ["label", "add", "--parent", "RAT-1", "bug", "--dry-run", "--json"],
      lines,
    )
    expect(lastJson(lines)).toMatchObject({
      dryRun: true,
      results: [{ identifier: "RAT-3", status: "updated" }],
    })
    expect(mutations(recorder, "mutation AddLabel")).toHaveLength(0)
  })

  test("prints one human line per child", async () => {
    const recorder = recorderFor([seed("RAT-3", { labels: [labels.bug] }), seed("RAT-4")])
    const lines: string[] = []
    await runIssue(recorder.handler, ["label", "add", "--parent", "RAT-1", "bug"], lines)
    expect(lines).toEqual(["RAT-3 already has bug.", "Added bug to RAT-4."])
  })

  test("removes a label from every child", async () => {
    const recorder = recorderFor([
      seed("RAT-3", { labels: [labels.ready] }),
      seed("RAT-4", { labels: [labels.ready] }),
    ])
    const lines: string[] = []
    await runIssue(
      recorder.handler,
      ["label", "remove", "--parent", "RAT-1", "ready-for-agent", "--json"],
      lines,
    )
    expect(lastJson(lines)).toMatchObject({
      results: [
        { identifier: "RAT-3", status: "updated" },
        { identifier: "RAT-4", status: "updated" },
      ],
    })
    expect(mutations(recorder, "mutation RemoveLabel")).toHaveLength(2)
  })

  test("requires a label with --parent", async () => {
    const recorder = recorderFor([seed("RAT-3")])
    const lines: string[] = []
    await runIssue(recorder.handler, ["label", "add", "--parent", "RAT-1"], lines)
    expect(lines).toContain("error: At least one label is required.")
    expect(recorder.requests).toHaveLength(0)
    expect(process.exitCode).toBe(2)
  })
})
