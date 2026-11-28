import type { Recorder } from "@test/issue-write/fixtures"

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

const handler = () =>
  makeRecorder((request) => {
    const detail = teamDetailResponse(request, {
      labels: [
        {
          id: "l-enh",
          name: "enhancement",
          color: "#111111",
          teamId: "00000000-0000-0000-0000-000000000001",
        },
        {
          id: "l-bug",
          name: "bug",
          color: "#EB5757",
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
    if (request.query.includes("query AvailableLabels")) {
      return jsonResponse({
        data: {
          issueLabels: {
            nodes: [
              { id: "l-enh", name: "enhancement", color: "#111111" },
              { id: "l-bug", name: "bug", color: "#EB5757" },
            ],
            pageInfo,
          },
        },
      })
    }
    if (request.query.includes("query Viewer")) {
      return jsonResponse({ data: { viewer } })
    }
    if (request.query.includes("mutation CreateIssue")) {
      return issueCreated()
    }
    return jsonResponse({ errors: [{ message: `Unexpected query: ${request.query}` }] }, 400)
  })

const seed = [
  {
    key: process.cwd(),
    team: "RAT",
    defaultAssignee: "me",
    defaultLabels: ["enhancement"],
    defaultPriority: 3,
  },
]

const create = async (recorder: Recorder, args: readonly string[]): Promise<string[]> => {
  const lines: string[] = []
  await runIssue(recorder.handler, ["create", ...args, "--format", "json"], lines, seed)
  return lines
}

afterEach(() => {
  process.exitCode = 0
})

describe("issue create defaults", () => {
  test("applies the repository defaults", async () => {
    const recorder = handler()
    await create(recorder, ["--title", "Fix login", "--team", "RAT"])
    const createRequest = requestOf(recorder, "mutation CreateIssue")
    expect(inputOf(createRequest?.variables ?? {})).toEqual({
      teamId: "00000000-0000-0000-0000-000000000001",
      title: "Fix login",
      labelIds: ["l-enh"],
      assigneeId: "u1",
      priority: 3,
    })
  })

  test("keeps an explicit priority and adds explicit labels to the defaults", async () => {
    const recorder = handler()
    await create(recorder, [
      "--title",
      "Fix login",
      "--team",
      "RAT",
      "--label",
      "bug",
      "--priority",
      "low",
    ])
    const createRequest = requestOf(recorder, "mutation CreateIssue")
    expect(inputOf(createRequest?.variables ?? {})).toEqual({
      teamId: "00000000-0000-0000-0000-000000000001",
      title: "Fix login",
      labelIds: ["l-enh", "l-bug"],
      assigneeId: "u1",
      priority: 4,
    })
  })

  test("drops the default assignee and priority with none", async () => {
    const recorder = handler()
    await create(recorder, [
      "--title",
      "Fix login",
      "--team",
      "RAT",
      "--assignee",
      "none",
      "--priority",
      "none",
    ])
    const createRequest = requestOf(recorder, "mutation CreateIssue")
    expect(inputOf(createRequest?.variables ?? {})).toEqual({
      teamId: "00000000-0000-0000-0000-000000000001",
      title: "Fix login",
      labelIds: ["l-enh"],
    })
  })

  test("deduplicates the default and explicit labels case-insensitively", async () => {
    const recorder = handler()
    await create(recorder, [
      "--title",
      "Fix login",
      "--team",
      "RAT",
      "--label",
      "Enhancement",
      "--label",
      "bug",
    ])
    const createRequest = requestOf(recorder, "mutation CreateIssue")
    expect(inputOf(createRequest?.variables ?? {})).toMatchObject({
      labelIds: ["l-enh", "l-bug"],
    })
  })

  test("plans the create without a mutation", async () => {
    const recorder = handler()
    const lines = await create(recorder, ["--title", "Fix login", "--team", "RAT", "--dry-run"])
    expect(lastJson(lines)).toMatchObject({
      issue: null,
      result: {
        action: "create",
        status: "updated",
        dryRun: true,
        changed: ["issue"],
        actions: [
          {
            action: "create",
            target: "new",
            status: "updated",
            changes: {
              team: "RAT",
              title: "Fix login",
              labels: ["enhancement"],
              assignee: "me",
              priority: "medium",
            },
          },
        ],
      },
    })
    expect(recorder.requests.some((request) => request.query.includes("mutation"))).toBe(false)
  })
})
