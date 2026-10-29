import { lastJson, runIssue } from "@test/cli-harness"
import { jsonResponse, pageInfo, user } from "@test/issue-fixtures"
import { issueCreated, makeRecorder, requestOf, run, team } from "@test/issue-write/fixtures"
import { afterEach, describe, expect, test } from "bun:test"
import { Effect } from "effect"

import { IssueWriteApi } from "@/api/issue-write"

const commentNode = {
  id: "c-new",
  body: "Body",
  createdAt: "2026-01-01T10:00:00.000Z",
  user,
}

const childNode = {
  id: "id-RAT-1",
}

const commentHandler = (comments: () => Response) =>
  makeRecorder((request) => {
    if (request.query.includes("query IssueId")) {
      return jsonResponse({ data: { issue: { id: "i1" } } })
    }
    if (request.query.includes("mutation CreateComment")) {
      return jsonResponse({
        data: { commentCreate: { success: true, comment: commentNode } },
      })
    }
    if (request.query.includes("query IssueCommentTail")) {
      return comments()
    }
    return jsonResponse({ errors: [{ message: `Unexpected query: ${request.query}` }] }, 400)
  })

const emptyComments = () => jsonResponse({ data: { issue: { comments: { nodes: [], pageInfo } } } })

const createHandler = (children: () => Response) =>
  makeRecorder((request) => {
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
  test("a comment that appears on a later read is visible", async () => {
    let reads = 0
    const recorder = commentHandler(() => {
      reads += 1
      return jsonResponse({
        data: {
          issue: {
            comments: { nodes: reads >= 2 ? [commentNode] : [], pageInfo },
          },
        },
      })
    })
    const result = await run(
      recorder.handler,
      Effect.gen(function* comment() {
        const api = yield* IssueWriteApi
        return yield* api.comment("RAT-1", "Body", { waitSeconds: 2 })
      }),
    )
    expect(result).toEqual({ comment: commentNode, visible: true })
    expect(reads).toBe(2)
  })

  test("a comment that never appears times out with visible false", async () => {
    const recorder = commentHandler(emptyComments)
    const result = await run(
      recorder.handler,
      Effect.gen(function* comment() {
        const api = yield* IssueWriteApi
        return yield* api.comment("RAT-1", "Body", { waitSeconds: 0.3 })
      }),
    )
    expect(result.visible).toBe(false)
  })

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

  test("a failed check reports not visible instead of failing the write", async () => {
    const recorder = commentHandler(() =>
      jsonResponse({ errors: [{ message: "Temporary read failure" }] }, 400),
    )
    const result = await run(
      recorder.handler,
      Effect.gen(function* comment() {
        const api = yield* IssueWriteApi
        return yield* api.comment("RAT-1", "Body", { waitSeconds: 0.3 })
      }),
    )
    expect(result.visible).toBe(false)
  })

  test("wait 0 skips the comment check", async () => {
    const recorder = commentHandler(emptyComments)
    const result = await run(
      recorder.handler,
      Effect.gen(function* comment() {
        const api = yield* IssueWriteApi
        return yield* api.comment("RAT-1", "Body", { waitSeconds: 0 })
      }),
    )
    expect(result.visible).toBeNull()
    expect(requestOf(recorder, "query IssueCommentTail")).toBeUndefined()
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

describe("visibility in the CLI", () => {
  test("a timed-out comment exits 0 in JSON mode", async () => {
    const recorder = commentHandler(emptyComments)
    const lines: string[] = []
    await runIssue(
      recorder.handler,
      ["comment", "RAT-1", "--body", "Body", "--wait", "1", "--json"],
      lines,
    )
    expect(lastJson(lines)).toEqual({ comment: commentNode, visible: false })
    expect(process.exitCode).toBe(0)
  })

  test("a timed-out comment in human mode prints a warning", async () => {
    const recorder = commentHandler(emptyComments)
    const lines: string[] = []
    await runIssue(recorder.handler, ["comment", "RAT-1", "--body", "Body", "--wait", "1"], lines)
    expect(lines).toContain("Commented on RAT-1.")
    expect(lines).toContain(
      "warning: The comment is not visible on RAT-1 yet. Linear may catch up later.",
    )
    expect(process.exitCode).toBe(0)
  })
})
