import { inputOf } from "@test/fake-linear/model"
import { jsonResponse, pageInfo, summaryNode, viewer } from "@test/issue-fixtures"
import { issueUpdated, makeRecorder, requestOf, run, states } from "@test/issue-write/fixtures"
import { describe, expect, test } from "bun:test"
import { Effect } from "effect"

import { IssueWriteApi } from "@/api/issue-write"

const summaryWith = (stateType: string) => ({
  ...summaryNode("RAT-1"),
  state: { name: stateType, type: stateType },
})

const stateHandler = (
  workflowStates: readonly { id: string; name: string; type: string }[],
  stateType = "started",
) =>
  makeRecorder((request) => {
    if (request.query.includes("query IssueSummary")) {
      return jsonResponse({ data: { issue: summaryWith(stateType) } })
    }
    if (request.query.includes("query IssueId")) {
      return jsonResponse({ data: { issue: { id: "i1" } } })
    }
    if (request.query.includes("query IssueStates")) {
      return jsonResponse({
        data: { issue: { team: { id: "team-1", states: { nodes: workflowStates, pageInfo } } } },
      })
    }
    if (request.query.includes("mutation UpdateIssue")) {
      return issueUpdated()
    }
    return jsonResponse({ errors: [{ message: `Unexpected query: ${request.query}` }] }, 400)
  })

const closeCommentHandler = () =>
  makeRecorder((request) => {
    if (request.query.includes("query IssueSummary")) {
      return jsonResponse({ data: { issue: summaryWith("started") } })
    }
    if (request.query.includes("query IssueId")) {
      return jsonResponse({ data: { issue: { id: "i1" } } })
    }
    if (request.query.includes("mutation CreateComment")) {
      return jsonResponse({
        data: {
          commentCreate: {
            success: true,
            comment: {
              id: "c1",
              body: "Done",
              createdAt: "2026-01-01T10:00:00.000Z",
              user: viewer,
            },
          },
        },
      })
    }
    if (request.query.includes("query IssueStates")) {
      return jsonResponse({
        data: { issue: { team: { id: "team-1", states: { nodes: states, pageInfo } } } },
      })
    }
    if (request.query.includes("mutation UpdateIssue")) {
      return issueUpdated()
    }
    return jsonResponse({ errors: [{ message: `Unexpected query: ${request.query}` }] }, 400)
  })

describe("IssueWriteApi state resolution", () => {
  test("close picks the completed state, not the first state", async () => {
    const recorder = stateHandler(states)
    await run(
      recorder.handler,
      Effect.gen(function* closeIssue() {
        const api = yield* IssueWriteApi
        return yield* api.close("RAT-1")
      }),
    )
    const update = requestOf(recorder, "mutation UpdateIssue")
    expect(inputOf(update?.variables ?? {})).toEqual({ stateId: "s-done" })
  })

  test("reopen picks the unstarted state, not the backlog state", async () => {
    const recorder = stateHandler(states)
    await run(
      recorder.handler,
      Effect.gen(function* reopenIssue() {
        const api = yield* IssueWriteApi
        return yield* api.reopen("RAT-1")
      }),
    )
    const update = requestOf(recorder, "mutation UpdateIssue")
    expect(inputOf(update?.variables ?? {})).toEqual({ stateId: "s-todo" })
  })

  test("close fails when the team has no completed state", async () => {
    const recorder = stateHandler(states.filter((state) => state.type !== "completed"))
    const error = await run(
      recorder.handler,
      Effect.gen(function* closeIssue() {
        const api = yield* IssueWriteApi
        return yield* Effect.flip(api.close("RAT-1"))
      }),
    )
    expect(error._tag).toBe("StateNotFoundError")
    expect(requestOf(recorder, "mutation UpdateIssue")).toBeUndefined()
  })

  test("close posts the comment before it moves the state", async () => {
    const recorder = closeCommentHandler()
    await run(
      recorder.handler,
      Effect.gen(function* closeIssue() {
        const api = yield* IssueWriteApi
        return yield* api.close("RAT-1", "Done")
      }),
    )
    const commentIndex = recorder.requests.findIndex((request) =>
      request.query.includes("mutation CreateComment"),
    )
    const updateIndex = recorder.requests.findIndex((request) =>
      request.query.includes("mutation UpdateIssue"),
    )
    expect(commentIndex).toBeGreaterThanOrEqual(0)
    expect(commentIndex).toBeLessThan(updateIndex)
    const comment = requestOf(recorder, "mutation CreateComment")
    expect(inputOf(comment?.variables ?? {})).toEqual({ issueId: "id-RAT-1", body: "Done" })
  })

  test("skips a close when the issue is already completed", async () => {
    const recorder = stateHandler(states, "completed")
    const result = await run(
      recorder.handler,
      Effect.gen(function* closeCompleted() {
        const api = yield* IssueWriteApi
        return yield* api.close("RAT-1")
      }),
    )
    expect(result.status).toBe("skipped")
    expect(requestOf(recorder, "mutation UpdateIssue")).toBeUndefined()
  })

  test("moves a canceled issue to the completed state", async () => {
    const recorder = stateHandler(states, "canceled")
    const result = await run(
      recorder.handler,
      Effect.gen(function* closeCanceled() {
        const api = yield* IssueWriteApi
        return yield* api.close("RAT-1")
      }),
    )
    expect(result.status).toBe("updated")
    expect(inputOf(requestOf(recorder, "mutation UpdateIssue")?.variables ?? {})).toEqual({
      stateId: "s-done",
    })
  })

  test("close dry run plans the state and the comment without writing", async () => {
    const recorder = closeCommentHandler()
    const result = await run(
      recorder.handler,
      Effect.gen(function* closeDryRun() {
        const api = yield* IssueWriteApi
        return yield* api.close("RAT-1", "Done", { dryRun: true })
      }),
    )
    expect(result.status).toBe("updated")
    expect(result.actions.map((action) => action.action)).toEqual(["close", "comment-create"])
    expect(requestOf(recorder, "mutation UpdateIssue")).toBeUndefined()
    expect(requestOf(recorder, "mutation CreateComment")).toBeUndefined()
  })

  test("reopen dry run plans the state without writing", async () => {
    const recorder = stateHandler(states)
    const result = await run(
      recorder.handler,
      Effect.gen(function* reopenDryRun() {
        const api = yield* IssueWriteApi
        return yield* api.reopen("RAT-1", { dryRun: true })
      }),
    )
    expect(result.actions[0]?.action).toBe("reopen")
    expect(result.actions[0]?.status).toBe("updated")
    expect(requestOf(recorder, "mutation UpdateIssue")).toBeUndefined()
  })

  test("skips a reopen when the issue is already unstarted", async () => {
    const recorder = stateHandler(states, "unstarted")
    const result = await run(
      recorder.handler,
      Effect.gen(function* reopenOpen() {
        const api = yield* IssueWriteApi
        return yield* api.reopen("RAT-1")
      }),
    )
    expect(result.status).toBe("skipped")
    expect(requestOf(recorder, "mutation UpdateIssue")).toBeUndefined()
  })

  test("posts the comment even when the issue is already completed", async () => {
    const recorder = makeRecorder((request) => {
      if (request.query.includes("query IssueSummary")) {
        return jsonResponse({ data: { issue: summaryWith("completed") } })
      }
      if (request.query.includes("mutation CreateComment")) {
        return jsonResponse({
          data: {
            commentCreate: {
              success: true,
              comment: {
                id: "c1",
                body: "Note",
                createdAt: "2026-01-01T10:00:00.000Z",
                user: viewer,
              },
            },
          },
        })
      }
      return jsonResponse({ errors: [{ message: `Unexpected query: ${request.query}` }] }, 400)
    })
    const result = await run(
      recorder.handler,
      Effect.gen(function* closeCompletedWithComment() {
        const api = yield* IssueWriteApi
        return yield* api.close("RAT-1", "Note")
      }),
    )
    expect(result.status).toBe("updated")
    expect(requestOf(recorder, "mutation CreateComment")).toBeDefined()
    expect(requestOf(recorder, "mutation UpdateIssue")).toBeUndefined()
  })
})
