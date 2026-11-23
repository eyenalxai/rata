import { jsonResponse, pageInfo, viewer } from "@test/issue-fixtures"
import { issueCreated, makeRecorder, requestOf, run, team } from "@test/issue-write/fixtures"
import { afterEach, describe, expect, test } from "bun:test"
import { Effect } from "effect"

import { IssueWriteApi } from "@/api/issue-write"

const childNode = {
  id: "id-RAT-1",
}

const createHandler = (children: () => Response) =>
  makeRecorder((request) => {
    if (request.query.includes("query Viewer")) {
      return jsonResponse({ data: { viewer } })
    }
    if (request.query.includes("query TeamStates")) {
      return jsonResponse({ data: { team: { states: { nodes: [], pageInfo } } } })
    }
    if (request.query.includes("query TeamLabels")) {
      return jsonResponse({ data: { issueLabels: { nodes: [], pageInfo } } })
    }
    if (request.query.includes("query TeamMembers")) {
      return jsonResponse({ data: { team: { members: { nodes: [], pageInfo } } } })
    }
    if (request.query.includes("query IssuePriorityValues")) {
      return jsonResponse({ data: { issuePriorityValues: [] } })
    }
    if (request.query.includes("query TeamByKey")) {
      return jsonResponse({ data: { teams: { nodes: [team], pageInfo } } })
    }
    if (request.query.includes("query IssueId")) {
      return jsonResponse({ data: { issue: { id: "i-parent" } } })
    }
    if (request.query.includes("mutation CreateIssue")) {
      return issueCreated()
    }
    if (request.query.includes("query IssueChildTail")) {
      return children()
    }
    return jsonResponse({ errors: [{ message: `Unexpected query: ${request.query}` }] }, 400)
  })

const emptyChildren = () => jsonResponse({ data: { issue: { children: { nodes: [], pageInfo } } } })

afterEach(() => {
  process.exitCode = 0
})

describe("read-after-write visibility", () => {
  test("a child that appears on a later read is visible", async () => {
    let reads = 0
    const recorder = createHandler(() => {
      reads += 1
      return jsonResponse({
        data: {
          issue: {
            children: { nodes: reads >= 2 ? [childNode] : [], pageInfo },
          },
        },
      })
    })
    const result = await run(
      recorder.handler,
      Effect.gen(function* create() {
        const api = yield* IssueWriteApi
        return yield* api.create({ title: "T", team: "RAT", parent: "RAT-0", waitSeconds: 2 })
      }),
    )
    expect(result.visible).toBe(true)
    expect(result.issue.identifier).toBe("RAT-1")
    expect(reads).toBe(2)
  })

  test("a child that never appears times out with visible false", async () => {
    const recorder = createHandler(emptyChildren)
    const result = await run(
      recorder.handler,
      Effect.gen(function* create() {
        const api = yield* IssueWriteApi
        return yield* api.create({ title: "T", team: "RAT", parent: "RAT-0", waitSeconds: 0.3 })
      }),
    )
    expect(result.visible).toBe(false)
  })

  test("a create without a parent skips the check", async () => {
    const recorder = createHandler(emptyChildren)
    const result = await run(
      recorder.handler,
      Effect.gen(function* create() {
        const api = yield* IssueWriteApi
        return yield* api.create({ title: "T", team: "RAT" })
      }),
    )
    expect(result.visible).toBeNull()
    expect(requestOf(recorder, "query IssueChildTail")).toBeUndefined()
  })
})
