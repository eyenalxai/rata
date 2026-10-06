import { inputOf } from "@test/fake-linear-model"
import { jsonResponse, pageInfo, summaryNode } from "@test/issue-fixtures"
import {
  issueCreated,
  issueUpdated,
  makeRecorder,
  requestOf,
  run,
  team,
} from "@test/issue-write-fixtures"
import { describe, expect, test } from "bun:test"
import { Effect } from "effect"

import { IssueWriteApi } from "@/api/issue-write"

const labelsHandler = () =>
  makeRecorder((request) => {
    if (request.query.includes("query IssueId")) {
      return jsonResponse({ data: { issue: { id: "i1" } } })
    }
    if (request.query.includes("query IssueTeam")) {
      return jsonResponse({ data: { issue: { team: { id: "team-1" } } } })
    }
    if (request.query.includes("query AvailableLabels")) {
      return request.variables.after === null
        ? jsonResponse({
            data: {
              issueLabels: {
                nodes: [{ id: "l1", name: "bug", color: "#111111" }],
                pageInfo: { hasNextPage: true, endCursor: "l1" },
              },
            },
          })
        : jsonResponse({
            data: {
              issueLabels: {
                nodes: [{ id: "l2", name: "ready-for-agent", color: "#111111" }],
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
    return jsonResponse({ errors: [{ message: `Unexpected query: ${request.query}` }] }, 400)
  })

const createHandler = () =>
  makeRecorder((request) => {
    if (request.query.includes("query TeamByKey")) {
      return jsonResponse({ data: { teams: { nodes: [team], pageInfo } } })
    }
    if (request.query.includes("query TeamStates")) {
      return request.variables.after === null
        ? jsonResponse({
            data: {
              team: {
                states: {
                  nodes: [{ id: "s-backlog", name: "Backlog", type: "backlog" }],
                  pageInfo: { hasNextPage: true, endCursor: "s-backlog" },
                },
              },
            },
          })
        : jsonResponse({
            data: {
              team: {
                states: {
                  nodes: [{ id: "s-todo", name: "Todo", type: "unstarted" }],
                  pageInfo,
                },
              },
            },
          })
    }
    if (request.query.includes("query Projects")) {
      return request.variables.after === null
        ? jsonResponse({
            data: {
              projects: {
                nodes: [{ id: "p-other", name: "Other", progress: 0, status: { name: "Backlog" } }],
                pageInfo: { hasNextPage: true, endCursor: "p-other" },
              },
            },
          })
        : jsonResponse({
            data: {
              projects: {
                nodes: [{ id: "p1", name: "Tracker", progress: 0, status: { name: "Started" } }],
                pageInfo,
              },
            },
          })
    }
    if (request.query.includes("mutation CreateIssue")) {
      return issueCreated()
    }
    return jsonResponse({ errors: [{ message: `Unexpected query: ${request.query}` }] }, 400)
  })

const closeHandler = () =>
  makeRecorder((request) => {
    if (request.query.includes("query IssueId")) {
      return jsonResponse({ data: { issue: { id: "i1" } } })
    }
    if (request.query.includes("query IssueStates")) {
      return request.variables.after === null
        ? jsonResponse({
            data: {
              issue: {
                team: {
                  id: "team-1",
                  states: {
                    nodes: [{ id: "s-todo", name: "Todo", type: "unstarted" }],
                    pageInfo: { hasNextPage: true, endCursor: "s-todo" },
                  },
                },
              },
            },
          })
        : jsonResponse({
            data: {
              issue: {
                team: {
                  id: "team-1",
                  states: { nodes: [{ id: "s-done", name: "Done", type: "completed" }], pageInfo },
                },
              },
            },
          })
    }
    if (request.query.includes("mutation UpdateIssue")) {
      return issueUpdated()
    }
    return jsonResponse({ errors: [{ message: `Unexpected query: ${request.query}` }] }, 400)
  })

describe("label drains", () => {
  test("addLabels finds a label on the next page", async () => {
    const recorder = labelsHandler()
    await run(
      recorder.handler,
      Effect.gen(function* addLabels() {
        const api = yield* IssueWriteApi
        return yield* api.addLabels("RAT-1", ["ready-for-agent"])
      }),
    )
    expect(requestOf(recorder, "mutation AddLabel")?.variables).toEqual({
      id: "i1",
      labelId: "l2",
    })
    const pages = recorder.requests.filter((request) =>
      request.query.includes("query AvailableLabels"),
    )
    expect(pages[0]?.variables).toEqual({ teamId: "team-1", first: 50, after: null })
    expect(pages[1]?.variables).toEqual({ teamId: "team-1", first: 50, after: "l1" })
  })
})

describe("workflow-state drains", () => {
  test("create finds the state and the project on the next page", async () => {
    const recorder = createHandler()
    await run(
      recorder.handler,
      Effect.gen(function* createIssue() {
        const api = yield* IssueWriteApi
        return yield* api.create({ title: "T", team: "RAT", state: "Todo", project: "Tracker" })
      }),
    )
    expect(inputOf(requestOf(recorder, "mutation CreateIssue")?.variables ?? {})).toEqual({
      teamId: "team-1",
      title: "T",
      stateId: "s-todo",
      projectId: "p1",
    })
    const statePages = recorder.requests.filter((request) =>
      request.query.includes("query TeamStates"),
    )
    expect(statePages[1]?.variables).toEqual({ teamId: "team-1", first: 50, after: "s-backlog" })
    const projectPages = recorder.requests.filter((request) =>
      request.query.includes("query Projects"),
    )
    expect(projectPages[1]?.variables).toEqual({ first: 50, after: "p-other" })
  })

  test("close finds the completed state on the next page", async () => {
    const recorder = closeHandler()
    await run(
      recorder.handler,
      Effect.gen(function* closeIssue() {
        const api = yield* IssueWriteApi
        return yield* api.close("RAT-1")
      }),
    )
    expect(inputOf(requestOf(recorder, "mutation UpdateIssue")?.variables ?? {})).toEqual({
      stateId: "s-done",
    })
    const pages = recorder.requests.filter((request) => request.query.includes("query IssueStates"))
    expect(pages).toHaveLength(2)
    expect(pages[1]?.variables).toEqual({ id: "i1", first: 50, after: "s-todo" })
  })
})
