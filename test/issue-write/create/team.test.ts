import { lastJson, runIssue } from "@test/cli-harness"
import { inputOf } from "@test/fake-linear/model"
import { jsonResponse, pageInfo } from "@test/issue-fixtures"
import {
  issueCreated,
  makeRecorder,
  requestOf,
  teamDetailResponse,
} from "@test/issue-write/fixtures"
import { describe, expect, test } from "bun:test"

const rat = {
  id: "00000000-0000-0000-0000-000000000001",
  key: "RAT",
  name: "Rata",
  timezone: "America/Los_Angeles",
}
const ops = { id: "team-2", key: "OPS", name: "Operations", timezone: "America/Los_Angeles" }

const handler = () =>
  makeRecorder((request) => {
    if (request.query.includes("query TeamByKey")) {
      const key = request.variables.key
      const teams = [rat, ops].filter((item) => item.key === key)
      return jsonResponse({ data: { teams: { nodes: teams, pageInfo } } })
    }
    const detail = teamDetailResponse(request, { team: ops })
    if (detail !== undefined) {
      return detail
    }
    if (request.query.includes("mutation CreateIssue")) {
      return issueCreated()
    }
    return jsonResponse({ errors: [{ message: `Unexpected query: ${request.query}` }] }, 400)
  })

describe("issue create team", () => {
  test("prefers --team over the linked team", async () => {
    const recorder = handler()
    const lines: string[] = []
    await runIssue(
      recorder.handler,
      ["create", "--title", "Fix login", "--team", "OPS", "--format", "json"],
      lines,
      [{ key: process.cwd(), team: "RAT" }],
    )

    expect(requestOf(recorder, "query TeamByKey")?.variables.key).toBe("OPS")
    expect(inputOf(requestOf(recorder, "mutation CreateIssue")?.variables ?? {})).toMatchObject({
      teamId: "team-2",
      title: "Fix login",
    })
    expect(lastJson(lines)).toMatchObject({ issue: { identifier: "RAT-1" } })
  })

  test("fails with not_linked when there is no team flag and no link", async () => {
    const lines: string[] = []
    const exit = await runIssue(
      makeRecorder(() => {
        throw new Error("the missing team must fail before a request")
      }).handler,
      ["create", "--title", "Fix login", "--format", "json"],
      lines,
      [],
    )

    expect(exit.code).toBe(2)
    expect(lastJson(lines)).toMatchObject({
      error: {
        code: "not_linked",
        message: "No team. Pass --team, or run `rata admin link`.",
      },
    })
  })
})
