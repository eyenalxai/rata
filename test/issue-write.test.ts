import { inputOf } from "@test/fake-linear-model"
import { jsonResponse, viewer } from "@test/issue-fixtures"
import {
  configWithTeam,
  issueCreated,
  issueUpdated,
  makeRecorder,
  otherTeam,
  requestOf,
  run,
  states,
  team,
} from "@test/issue-write-fixtures"
import { describe, expect, test } from "bun:test"
import { Effect } from "effect"

import { IssueWriteApi } from "@/api/issue-write"

const teamHandler = () =>
  makeRecorder((request) => {
    if (request.query.includes("query TeamByKey")) {
      const key = request.variables.key
      return jsonResponse({
        data: { teams: { nodes: [team, otherTeam].filter((item) => item.key === key) } },
      })
    }
    if (request.query.includes("mutation CreateIssue")) {
      return issueCreated()
    }
    return jsonResponse({ errors: [{ message: `Unexpected query: ${request.query}` }] }, 400)
  })

const stateHandler = (workflowStates: readonly { id: string; name: string; type: string }[]) =>
  makeRecorder((request) => {
    if (request.query.includes("query IssueId")) {
      return jsonResponse({ data: { issue: { id: "i1" } } })
    }
    if (request.query.includes("query IssueStates")) {
      return jsonResponse({
        data: { issue: { team: { id: "team-1", states: { nodes: workflowStates } } } },
      })
    }
    if (request.query.includes("mutation UpdateIssue")) {
      return issueUpdated()
    }
    return jsonResponse({ errors: [{ message: `Unexpected query: ${request.query}` }] }, 400)
  })

const closeCommentHandler = () =>
  makeRecorder((request) => {
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
        data: { issue: { team: { id: "team-1", states: { nodes: states } } } },
      })
    }
    if (request.query.includes("mutation UpdateIssue")) {
      return issueUpdated()
    }
    return jsonResponse({ errors: [{ message: `Unexpected query: ${request.query}` }] }, 400)
  })

describe("IssueWriteApi team resolution", () => {
  test("prefers the --team flag over .rata.json", async () => {
    const recorder = teamHandler()
    await run(
      recorder.handler,
      Effect.gen(function* createIssue() {
        const api = yield* IssueWriteApi
        return yield* api.create({ title: "T", team: "OPS" })
      }),
      configWithTeam("RAT"),
    )
    expect(requestOf(recorder, "query TeamByKey")?.variables.key).toBe("OPS")
    const create = requestOf(recorder, "mutation CreateIssue")
    expect(inputOf(create?.variables ?? {})).toMatchObject({ teamId: "team-2", title: "T" })
  })

  test("uses the team from .rata.json without --team", async () => {
    const recorder = teamHandler()
    await run(
      recorder.handler,
      Effect.gen(function* createIssue() {
        const api = yield* IssueWriteApi
        return yield* api.create({ title: "T" })
      }),
      configWithTeam("RAT"),
    )
    expect(requestOf(recorder, "query TeamByKey")?.variables.key).toBe("RAT")
    const create = requestOf(recorder, "mutation CreateIssue")
    expect(inputOf(create?.variables ?? {})).toMatchObject({ teamId: "team-1" })
  })

  test("fails when there is no team flag and no .rata.json", async () => {
    const recorder = teamHandler()
    const error = await run(
      recorder.handler,
      Effect.gen(function* createIssue() {
        const api = yield* IssueWriteApi
        return yield* Effect.flip(api.create({ title: "T" }))
      }),
    )
    expect(error._tag).toBe("TeamResolutionError")
    expect(requestOf(recorder, "mutation CreateIssue")).toBeUndefined()
  })
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
    expect(inputOf(comment?.variables ?? {})).toEqual({ issueId: "i1", body: "Done" })
  })
})
