import { inputOf } from "@test/fake-linear"
import { jsonResponse, summaryNode, viewer } from "@test/issue-fixtures"
import {
  issueCreated,
  issueUpdated,
  makeRecorder,
  requestOf,
  run,
  states,
  team,
} from "@test/issue-write-fixtures"
import { describe, expect, test } from "bun:test"
import { Effect, FileSystem, Layer, Option, Stdio, Stream } from "effect"

import { IssueWriteApi } from "@/api/issue-write"
import { resolveBody } from "@/cli/body"

const labelsHandler = () =>
  makeRecorder((request) => {
    if (request.query.includes("query IssueId")) {
      return jsonResponse({ data: { issue: { id: "i1" } } })
    }
    if (request.query.includes("query IssueTeam")) {
      return jsonResponse({ data: { issue: { team: { id: "team-1" } } } })
    }
    if (request.query.includes("query AvailableLabels")) {
      return jsonResponse({
        data: {
          issueLabels: {
            nodes: [
              { id: "l1", name: "ready-for-agent", color: "#111111" },
              { id: "l-bug", name: "Bug", color: "#EB5757" },
            ],
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

const createHandler = () =>
  makeRecorder((request) => {
    if (request.query.includes("query TeamByKey")) {
      return jsonResponse({ data: { teams: { nodes: [team] } } })
    }
    if (request.query.includes("query TeamStates")) {
      return jsonResponse({ data: { team: { states: { nodes: states } } } })
    }
    if (request.query.includes("query IssueId")) {
      return jsonResponse({ data: { issue: { id: "i-parent" } } })
    }
    if (request.query.includes("query Projects")) {
      return jsonResponse({
        data: {
          projects: {
            nodes: [{ id: "p1", name: "Tracker", progress: 0, status: { name: "Started" } }],
          },
        },
      })
    }
    if (request.query.includes("query Viewer")) {
      return jsonResponse({ data: { viewer } })
    }
    if (request.query.includes("query AvailableLabels")) {
      return jsonResponse({
        data: { issueLabels: { nodes: [{ id: "l1", name: "ready-for-agent", color: "#111111" }] } },
      })
    }
    if (request.query.includes("mutation CreateIssue")) {
      return issueCreated()
    }
    return jsonResponse({ errors: [{ message: `Unexpected query: ${request.query}` }] }, 400)
  })

const minimalCreateHandler = () =>
  makeRecorder((request) => {
    if (request.query.includes("query TeamByKey")) {
      return jsonResponse({ data: { teams: { nodes: [team] } } })
    }
    if (request.query.includes("mutation CreateIssue")) {
      return issueCreated()
    }
    return jsonResponse({ errors: [{ message: `Unexpected query: ${request.query}` }] }, 400)
  })

const updateHandler = () =>
  makeRecorder((request) => {
    if (request.query.includes("query IssueId")) {
      return jsonResponse({ data: { issue: { id: "i1" } } })
    }
    if (request.query.includes("mutation UpdateIssue")) {
      return issueUpdated()
    }
    return jsonResponse({ errors: [{ message: `Unexpected query: ${request.query}` }] }, 400)
  })

const bodyLayer = (input: string) =>
  Layer.mergeAll(
    Stdio.layerTest({ stdin: Stream.make(new TextEncoder().encode(input)) }),
    FileSystem.layerNoop({}),
  )

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
      id: "i1",
      labelId: "l1",
    })
  })

  test("calls issueRemoveLabel with the resolved label id", async () => {
    const recorder = labelsHandler()
    await run(
      recorder.handler,
      Effect.gen(function* removeLabels() {
        const api = yield* IssueWriteApi
        return yield* api.removeLabels("RAT-1", ["ready-for-agent"])
      }),
    )
    expect(requestOf(recorder, "mutation RemoveLabel")?.variables).toEqual({
      id: "i1",
      labelId: "l1",
    })
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
      id: "i1",
      labelId: "l-bug",
    })
  })

  test("resolves a workspace label case-insensitively when removing", async () => {
    const recorder = labelsHandler()
    await run(
      recorder.handler,
      Effect.gen(function* removeLabels() {
        const api = yield* IssueWriteApi
        return yield* api.removeLabels("RAT-1", ["BUG"])
      }),
    )
    expect(requestOf(recorder, "mutation RemoveLabel")?.variables).toEqual({
      id: "i1",
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

describe("IssueWriteApi create payload", () => {
  test("resolves every option to an id and sends one input object", async () => {
    const recorder = createHandler()
    await run(
      recorder.handler,
      Effect.gen(function* createIssue() {
        const api = yield* IssueWriteApi
        return yield* api.create({
          title: "Fix login",
          body: "The body.",
          team: "RAT",
          labels: ["ready-for-agent"],
          state: "Todo",
          parent: "RAT-0",
          project: "Tracker",
          assignee: "me",
          priority: 2,
        })
      }),
    )
    const create = requestOf(recorder, "mutation CreateIssue")
    expect(inputOf(create?.variables ?? {})).toEqual({
      teamId: "team-1",
      title: "Fix login",
      description: "The body.",
      labelIds: ["l1"],
      stateId: "s-todo",
      parentId: "i-parent",
      projectId: "p1",
      assigneeId: "u1",
      priority: 2,
    })
  })

  test("omits an empty body from the create input", async () => {
    const recorder = minimalCreateHandler()
    await run(
      recorder.handler,
      Effect.gen(function* createIssue() {
        const api = yield* IssueWriteApi
        return yield* api.create({ title: "No body", body: "", team: "RAT" })
      }),
    )
    const create = requestOf(recorder, "mutation CreateIssue")
    expect(inputOf(create?.variables ?? {})).toEqual({ teamId: "team-1", title: "No body" })
  })
})

describe("IssueWriteApi unassign", () => {
  test("sends assigneeId null instead of omitting the field", async () => {
    const recorder = updateHandler()
    await run(
      recorder.handler,
      Effect.gen(function* unassignIssue() {
        const api = yield* IssueWriteApi
        return yield* api.unassign("RAT-1")
      }),
    )
    const update = requestOf(recorder, "mutation UpdateIssue")
    expect(inputOf(update?.variables ?? {})).toEqual({ assigneeId: null })
  })
})

describe("resolveBody", () => {
  test("reads the body from standard input for --body-file -", async () => {
    const body = await resolveBody(
      { body: "body", file: "body-file" },
      Option.none(),
      Option.some("-"),
    ).pipe(Effect.provide(bodyLayer("Body from stdin\n")), Effect.runPromise)
    expect(body).toEqual(Option.some("Body from stdin"))
  })

  test("rejects --body and --body-file together", async () => {
    const error = await resolveBody(
      { body: "body", file: "body-file" },
      Option.some("a"),
      Option.some("b"),
    ).pipe(Effect.provide(bodyLayer("")), Effect.flip, Effect.runPromise)
    expect(error._tag).toBe("BodyInputError")
  })
})
