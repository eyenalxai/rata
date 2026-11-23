import { inputOf } from "@test/fake-linear/model"
import { jsonResponse, pageInfo, viewer } from "@test/issue-fixtures"
import {
  configWithTeam,
  issueCreated,
  makeRecorder,
  otherTeam,
  requestOf,
  run,
  team,
} from "@test/issue-write/fixtures"
import { describe, expect, test } from "bun:test"
import { Effect } from "effect"

import { IssueWriteApi } from "@/api/issue-write"

const teamHandler = () =>
  makeRecorder((request) => {
    if (request.query.includes("query Viewer")) {
      return jsonResponse({ data: { viewer } })
    }
    if (request.query.includes("query TeamStates")) {
      return jsonResponse({ data: { team: { states: { nodes: [], pageInfo } } } })
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
    if (request.query.includes("query TeamByKey")) {
      const key = request.variables.key
      return jsonResponse({
        data: { teams: { nodes: [team, otherTeam].filter((item) => item.key === key), pageInfo } },
      })
    }
    if (request.query.includes("mutation CreateIssue")) {
      return issueCreated()
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
      { repositories: [] },
    )
    expect(error._tag).toBe("TeamResolutionError")
    expect(requestOf(recorder, "mutation CreateIssue")).toBeUndefined()
  })
})
