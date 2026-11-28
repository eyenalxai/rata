import { lastJson, runIssue } from "@test/cli-harness"
import { inputOf } from "@test/fake-linear/model"
import { jsonResponse, pageInfo, viewer } from "@test/issue-fixtures"
import {
  issueCreated,
  makeRecorder,
  requestOf,
  team,
  teamDetailResponse,
} from "@test/issue-write/fixtures"
import { afterEach, describe, expect, test } from "bun:test"
import { Stream } from "effect"

const handler = () =>
  makeRecorder((request) => {
    const detail = teamDetailResponse(request, {
      labels: [
        {
          id: "l1",
          name: "ready-for-agent",
          color: "#111111",
          teamId: "00000000-0000-0000-0000-000000000001",
        },
      ],
    })
    if (detail !== undefined) {
      return detail
    }
    if (request.query.includes("query TeamByKey")) {
      return jsonResponse({ data: { teams: { nodes: [team], pageInfo } } })
    }
    if (request.query.includes("query IssueId")) {
      return jsonResponse({ data: { issue: { id: "i-parent" } } })
    }
    if (request.query.includes("query Projects")) {
      return jsonResponse({
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
    if (request.query.includes("query Viewer")) {
      return jsonResponse({ data: { viewer } })
    }
    if (request.query.includes("query AvailableLabels")) {
      return jsonResponse({
        data: {
          issueLabels: {
            nodes: [{ id: "l1", name: "ready-for-agent", color: "#111111" }],
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

describe("issue create payload", () => {
  test("resolves every option to an id and sends one input object", async () => {
    const recorder = handler()
    const lines: string[] = []
    await runIssue(
      recorder.handler,
      [
        "create",
        "--title",
        "Fix login",
        "--team",
        "RAT",
        "--label",
        "ready-for-agent",
        "--state",
        "Todo",
        "--parent",
        "RAT-0",
        "--project",
        "Tracker",
        "--assignee",
        "me",
        "--priority",
        "high",
        "--body-file",
        "-",
        "--format",
        "json",
      ],
      lines,
      undefined,
      { stdio: { stdin: Stream.make(new TextEncoder().encode("The body.")) } },
    )

    const create = requestOf(recorder, "mutation CreateIssue")
    expect(lastJson(lines)).toMatchObject({ issue: { identifier: "RAT-1" } })
    expect(inputOf(create?.variables ?? {})).toEqual({
      teamId: "00000000-0000-0000-0000-000000000001",
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
    const recorder = handler()
    const lines: string[] = []
    await runIssue(
      recorder.handler,
      ["create", "--title", "No body", "--team", "RAT", "--body-file", "-", "--format", "json"],
      lines,
      undefined,
      { stdio: { stdin: Stream.make(new TextEncoder().encode("")) } },
    )

    const create = requestOf(recorder, "mutation CreateIssue")
    expect(inputOf(create?.variables ?? {})).toEqual({
      teamId: "00000000-0000-0000-0000-000000000001",
      title: "No body",
    })
  })
})
