import { jsonResponse, pageInfo, summaryNode } from "@test/issue-fixtures"
import { makeRecorder, requestOf, run } from "@test/issue-write/fixtures"
import { describe, expect, test } from "bun:test"
import { Effect } from "effect"

import { IssueWriteApi } from "@/api/issue-write"

const labelsHandler = (current: readonly { id: string; name: string }[] = []) =>
  makeRecorder((request) => {
    if (request.query.includes("query IssueSummary")) {
      return jsonResponse({
        data: { issue: { ...summaryNode("RAT-1"), labels: { nodes: current } } },
      })
    }
    if (request.query.includes("query IssueId")) {
      return jsonResponse({ data: { issue: { id: "i1" } } })
    }
    if (request.query.includes("query IssueTeam")) {
      return jsonResponse({ data: { issue: { team: { id: "team-1" } } } })
    }
    if (request.query.includes("query IssueLabels")) {
      return jsonResponse({
        data: { issue: { labels: { nodes: current, pageInfo } } },
      })
    }
    if (request.query.includes("query AvailableLabels")) {
      return jsonResponse({
        data: {
          issueLabels: {
            nodes: [
              { id: "l1", name: "ready-for-agent", color: "#111111" },
              { id: "l-bug", name: "Bug", color: "#EB5757" },
            ],
            pageInfo,
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
    return jsonResponse({ errors: [{ message: `Unexpected query: ${request.query}` }] }, 400)
  })

describe("IssueWriteApi labels", () => {
  test("maps a triage role to the team label id and calls issueAddLabel", async () => {
    const recorder = labelsHandler()
    await run(
      recorder.handler,
      Effect.gen(function* addLabels() {
        const api = yield* IssueWriteApi
        return yield* api.addLabels("RAT-1", ["READY-FOR-AGENT"])
      }),
    )
    expect(requestOf(recorder, "mutation AddLabel")?.variables).toEqual({
      id: "id-RAT-1",
      labelId: "l1",
    })
  })

  test("calls issueRemoveLabel with the resolved label id", async () => {
    const recorder = labelsHandler([{ id: "l1", name: "ready-for-agent" }])
    await run(
      recorder.handler,
      Effect.gen(function* removeLabels() {
        const api = yield* IssueWriteApi
        return yield* api.removeLabels("RAT-1", ["ready-for-agent"])
      }),
    )
    expect(requestOf(recorder, "mutation RemoveLabel")?.variables).toEqual({
      id: "id-RAT-1",
      labelId: "l1",
    })
  })

  test("skips a label that the issue already has", async () => {
    const recorder = labelsHandler([{ id: "l1", name: "ready-for-agent" }])
    const result = await run(
      recorder.handler,
      Effect.gen(function* addPresentLabel() {
        const api = yield* IssueWriteApi
        return yield* api.addLabels("RAT-1", ["ready-for-agent"])
      }),
    )
    expect(result.status).toBe("skipped")
    expect(requestOf(recorder, "mutation AddLabel")).toBeUndefined()
  })

  test("skips a label that the issue does not have when removing", async () => {
    const recorder = labelsHandler()
    const result = await run(
      recorder.handler,
      Effect.gen(function* removeAbsentLabel() {
        const api = yield* IssueWriteApi
        return yield* api.removeLabels("RAT-1", ["ready-for-agent"])
      }),
    )
    expect(result.status).toBe("skipped")
    expect(requestOf(recorder, "mutation RemoveLabel")).toBeUndefined()
  })

  test("resolves a workspace label case-insensitively when adding", async () => {
    const recorder = labelsHandler()
    await run(
      recorder.handler,
      Effect.gen(function* addLabels() {
        const api = yield* IssueWriteApi
        return yield* api.addLabels("RAT-1", ["bug"])
      }),
    )
    expect(requestOf(recorder, "mutation AddLabel")?.variables).toEqual({
      id: "id-RAT-1",
      labelId: "l-bug",
    })
  })

  test("fails before any mutation when the label does not exist", async () => {
    const recorder = labelsHandler()
    const error = await run(
      recorder.handler,
      Effect.gen(function* addLabels() {
        const api = yield* IssueWriteApi
        return yield* Effect.flip(api.addLabels("RAT-1", ["nope"]))
      }),
    )
    expect(error._tag).toBe("LabelNotFoundError")
    expect(requestOf(recorder, "mutation AddLabel")).toBeUndefined()
  })
})
