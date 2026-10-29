import { lastJson, runIssue } from "@test/cli-harness"
import { commentHandler, commentNode } from "@test/issue-comment/fixtures"
import { jsonResponse, pageInfo } from "@test/issue-fixtures"
import { makeRecorder } from "@test/issue-write/fixtures"
import { afterEach, describe, expect, test } from "bun:test"

import { dedupeCommentId } from "@/domain/comment"

afterEach(() => {
  process.exitCode = 0
})

describe("issue comment create dedupe", () => {
  test("without a dedupe key every call creates a comment", async () => {
    const { recorder, state } = commentHandler()
    const first: string[] = []
    const second: string[] = []
    await runIssue(
      recorder.handler,
      ["comment", "create", "RAT-1", "--body", "One.", "--wait", "0", "--json"],
      first,
    )
    await runIssue(
      recorder.handler,
      ["comment", "create", "RAT-1", "--body", "Two.", "--wait", "0", "--json"],
      second,
    )
    expect(state.creates).toBe(2)
    expect(lastJson(first)).toMatchObject({
      status: "created",
      comment: { body: "One." },
      visible: null,
    })
    expect(lastJson(second)).toMatchObject({ status: "created", comment: { body: "Two." } })
  })

  test("the first keyed create writes and the second is skipped", async () => {
    const { recorder, state } = commentHandler()
    const first: string[] = []
    const second: string[] = []
    const args = [
      "comment",
      "create",
      "RAT-1",
      "--body",
      "Handoff.",
      "--dedupe-key",
      "mission-1",
      "--wait",
      "0",
      "--json",
    ]
    await runIssue(recorder.handler, args, first)
    await runIssue(recorder.handler, args, second)
    expect(state.creates).toBe(1)
    expect(lastJson(first)).toMatchObject({ status: "created" })
    expect(lastJson(second)).toMatchObject({
      status: "skipped",
      comment: { id: dedupeCommentId("i1", "mission-1") },
      visible: null,
    })
  })

  test("the same key on another issue creates a new comment", async () => {
    const { recorder, state } = commentHandler()
    await runIssue(
      recorder.handler,
      [
        "comment",
        "create",
        "RAT-1",
        "--body",
        "Handoff.",
        "--dedupe-key",
        "k",
        "--wait",
        "0",
        "--json",
      ],
      [],
    )
    await runIssue(
      recorder.handler,
      [
        "comment",
        "create",
        "RAT-2",
        "--body",
        "Handoff.",
        "--dedupe-key",
        "k",
        "--wait",
        "0",
        "--json",
      ],
      [],
    )
    expect(state.creates).toBe(2)
    expect(state.comments.has(dedupeCommentId("i1", "k"))).toBe(true)
    expect(state.comments.has(dedupeCommentId("i2", "k"))).toBe(true)
  })

  test("a duplicate create error re-reads and returns the existing comment", async () => {
    const id = dedupeCommentId("i1", "race")
    const seed = commentNode(id, "Handoff.")
    let reads = 0
    const recorder = makeRecorder((request) => {
      if (request.query.includes("query IssueId")) {
        return jsonResponse({ data: { issue: { id: "i1" } } })
      }
      if (request.query.includes("query CommentById")) {
        reads += 1
        return jsonResponse({
          data: { comments: { nodes: reads === 1 ? [] : [seed], pageInfo } },
        })
      }
      if (request.query.includes("mutation CreateComment")) {
        return jsonResponse({ errors: [{ message: "Duplicate comment id" }] }, 400)
      }
      return jsonResponse({ errors: [{ message: `Unexpected query: ${request.query}` }] }, 400)
    })
    const lines: string[] = []
    await runIssue(
      recorder.handler,
      [
        "comment",
        "create",
        "RAT-1",
        "--body",
        "Handoff.",
        "--dedupe-key",
        "race",
        "--wait",
        "0",
        "--json",
      ],
      lines,
    )
    expect(lastJson(lines)).toMatchObject({ status: "skipped", comment: { id } })
    expect(reads).toBe(2)
    expect(process.exitCode).toBe(0)
  })

  test("a dry run resolves the dedupe key and writes nothing", async () => {
    const { recorder, state } = commentHandler({
      seeds: [commentNode(dedupeCommentId("i1", "k"), "Handoff.")],
    })
    const lines: string[] = []
    await runIssue(
      recorder.handler,
      [
        "comment",
        "create",
        "RAT-1",
        "--body",
        "Handoff.",
        "--dedupe-key",
        "k",
        "--dry-run",
        "--json",
      ],
      lines,
    )
    expect(lastJson(lines)).toMatchObject({
      dryRun: true,
      action: "comment-create",
      target: "RAT-1",
      status: "skipped",
    })
    expect(state.creates).toBe(0)
  })
})
