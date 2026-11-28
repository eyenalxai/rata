import { runIssue } from "@test/cli-harness"
import { inputOf } from "@test/fake-linear/model"
import { jsonResponse, pageInfo } from "@test/issue-fixtures"
import { issueCreated, makeRecorder, requestOf, team } from "@test/issue-write/fixtures"
import { afterEach, describe, expect, test } from "bun:test"

const createHandler = () =>
  makeRecorder((request) => {
    if (request.query.includes("query TeamByKey")) {
      return jsonResponse({ data: { teams: { nodes: [team], pageInfo } } })
    }
    if (request.query.includes("query TeamById")) {
      return jsonResponse({ data: { teams: { nodes: [team], pageInfo } } })
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
    if (request.query.includes("query TeamStates")) {
      return request.variables.after === null
        ? jsonResponse({
            data: {
              team: {
                states: {
                  nodes: [{ id: "s-backlog", name: "Backlog", type: "backlog", position: 0 }],
                  pageInfo: { hasNextPage: true, endCursor: "s-backlog" },
                },
              },
            },
          })
        : jsonResponse({
            data: {
              team: {
                states: {
                  nodes: [{ id: "s-todo", name: "Todo", type: "unstarted", position: 1 }],
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
                nodes: [
                  {
                    id: "p-other",
                    name: "Other",
                    progress: 0,
                    status: { name: "Backlog" },
                    trashed: null,
                  },
                ],
                pageInfo: { hasNextPage: true, endCursor: "p-other" },
              },
            },
          })
        : jsonResponse({
            data: {
              projects: {
                nodes: [
                  {
                    id: "p1",
                    name: "Tracker",
                    progress: 0,
                    status: { name: "Started" },
                    trashed: null,
                  },
                ],
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

afterEach(() => {
  process.exitCode = 0
})

describe("create drains", () => {
  test("finds the state and the project on the next page", async () => {
    const recorder = createHandler()
    const lines: string[] = []
    await runIssue(
      recorder.handler,
      [
        "create",
        "--title",
        "T",
        "--team",
        "RAT",
        "--state",
        "Todo",
        "--project",
        "Tracker",
        "--format",
        "json",
      ],
      lines,
    )

    expect(inputOf(requestOf(recorder, "mutation CreateIssue")?.variables ?? {})).toEqual({
      teamId: "00000000-0000-0000-0000-000000000001",
      title: "T",
      stateId: "s-todo",
      projectId: "p1",
    })
    const statePages = recorder.requests.filter((request) =>
      request.query.includes("query TeamStates"),
    )
    expect(statePages[1]?.variables).toEqual({
      teamId: "00000000-0000-0000-0000-000000000001",
      first: 50,
      after: "s-backlog",
    })
    const projectPages = recorder.requests.filter((request) =>
      request.query.includes("query Projects"),
    )
    expect(projectPages[1]?.variables).toEqual({
      first: 50,
      after: "p-other",
      includeArchived: false,
    })
  })
})
