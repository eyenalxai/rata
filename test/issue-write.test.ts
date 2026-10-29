import { inputOf } from "@test/fake-linear/model"
import { jsonResponse, pageInfo, summaryNode, viewer } from "@test/issue-fixtures"
import {
  configWithTeam,
  issueCreated,
  issueUpdated,
  makeRecorder,
  otherTeam,
  requestOf,
  run,
  team,
} from "@test/issue-write/fixtures"
import { describe, expect, test } from "bun:test"
import { Effect } from "effect"

import { IssueWriteApi } from "@/api/issue-write"

const summaryWith = (stateType: string) => ({
  ...summaryNode("RAT-1"),
  state: { name: stateType, type: stateType },
})

const teamHandler = () =>
  makeRecorder((request) => {
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
    )
    expect(error._tag).toBe("TeamResolutionError")
    expect(requestOf(recorder, "mutation CreateIssue")).toBeUndefined()
  })
})

const assignHandler = (assignee: typeof viewer | null) =>
  makeRecorder((request) => {
    if (request.query.includes("query IssueSummary")) {
      return jsonResponse({ data: { issue: { ...summaryWith("started"), assignee } } })
    }
    if (request.query.includes("query Viewer")) {
      return jsonResponse({ data: { viewer } })
    }
    if (request.query.includes("mutation UpdateIssue")) {
      return issueUpdated()
    }
    return jsonResponse({ errors: [{ message: `Unexpected query: ${request.query}` }] }, 400)
  })

describe("IssueWriteApi assign", () => {
  test("skips when the assignee already holds the issue", async () => {
    const recorder = assignHandler(viewer)
    const result = await run(
      recorder.handler,
      Effect.gen(function* assignSame() {
        const api = yield* IssueWriteApi
        return yield* api.assign("RAT-1", "me")
      }),
    )
    expect(result.status).toBe("skipped")
    expect(requestOf(recorder, "mutation UpdateIssue")).toBeUndefined()
  })

  test("clears the assignee with none", async () => {
    const recorder = assignHandler(viewer)
    const result = await run(
      recorder.handler,
      Effect.gen(function* assignNone() {
        const api = yield* IssueWriteApi
        return yield* api.assign("RAT-1", "none")
      }),
    )
    expect(result.status).toBe("updated")
    expect(inputOf(requestOf(recorder, "mutation UpdateIssue")?.variables ?? {})).toEqual({
      assigneeId: null,
    })
  })

  test("does not write on a dry run", async () => {
    const recorder = assignHandler(null)
    const result = await run(
      recorder.handler,
      Effect.gen(function* dryRunAssign() {
        const api = yield* IssueWriteApi
        return yield* api.assign("RAT-1", "me", { dryRun: true })
      }),
    )
    expect(result.actions).toEqual([
      {
        action: "assign",
        target: "RAT-1",
        status: "updated",
        changes: { assignee: "me" },
      },
    ])
    expect(requestOf(recorder, "mutation UpdateIssue")).toBeUndefined()
  })
})

describe("IssueWriteApi unassign", () => {
  test("skips when the issue is already unassigned", async () => {
    const recorder = assignHandler(null)
    const result = await run(
      recorder.handler,
      Effect.gen(function* unassignEmpty() {
        const api = yield* IssueWriteApi
        return yield* api.unassign("RAT-1")
      }),
    )
    expect(result.status).toBe("skipped")
    expect(requestOf(recorder, "mutation UpdateIssue")).toBeUndefined()
  })
})
