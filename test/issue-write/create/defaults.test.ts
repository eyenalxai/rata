import { inputOf } from "@test/fake-linear/model"
import { jsonResponse, pageInfo, viewer } from "@test/issue-fixtures"
import { issueCreated, makeRecorder, requestOf, run, team } from "@test/issue-write/fixtures"
import { describe, expect, test } from "bun:test"
import { Effect } from "effect"

import { IssueWriteApi } from "@/api/issue-write"

const handler = () =>
  makeRecorder((request) => {
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

describe("IssueWriteApi create defaults", () => {
  test("applies the repository defaults", async () => {
    const recorder = handler()
    await run(
      recorder.handler,
      Effect.gen(function* createIssue() {
        const api = yield* IssueWriteApi
        return yield* api.create({ title: "Fix login", team: "RAT" })
      }),
      { repositories: seed },
    )
    const create = requestOf(recorder, "mutation CreateIssue")
    expect(inputOf(create?.variables ?? {})).toEqual({
      teamId: "team-1",
      title: "Fix login",
      labelIds: ["l-enh"],
      assigneeId: "u1",
      priority: 3,
    })
  })

  test("keeps an explicit priority and adds explicit labels to the defaults", async () => {
    const recorder = handler()
    await run(
      recorder.handler,
      Effect.gen(function* createIssue() {
        const api = yield* IssueWriteApi
        return yield* api.create({
          title: "Fix login",
          team: "RAT",
          labels: ["bug"],
          priority: 4,
        })
      }),
      { repositories: seed },
    )
    const create = requestOf(recorder, "mutation CreateIssue")
    expect(inputOf(create?.variables ?? {})).toEqual({
      teamId: "team-1",
      title: "Fix login",
      labelIds: ["l-enh", "l-bug"],
      assigneeId: "u1",
      priority: 4,
    })
  })

  test("drops the defaults with useDefaultLabels false and none values", async () => {
    const recorder = handler()
    await run(
      recorder.handler,
      Effect.gen(function* createIssue() {
        const api = yield* IssueWriteApi
        return yield* api.create({
          title: "Fix login",
          team: "RAT",
          useDefaultLabels: false,
          assignee: "none",
          priority: 0,
        })
      }),
      { repositories: seed },
    )
    const create = requestOf(recorder, "mutation CreateIssue")
    expect(inputOf(create?.variables ?? {})).toEqual({ teamId: "team-1", title: "Fix login" })
  })

  test("deduplicates the default and explicit labels case-insensitively", async () => {
    const recorder = handler()
    await run(
      recorder.handler,
      Effect.gen(function* createIssue() {
        const api = yield* IssueWriteApi
        return yield* api.create({
          title: "Fix login",
          team: "RAT",
          labels: ["Enhancement", "bug"],
        })
      }),
      { repositories: seed },
    )
    const create = requestOf(recorder, "mutation CreateIssue")
    expect(inputOf(create?.variables ?? {})).toMatchObject({ labelIds: ["l-enh", "l-bug"] })
  })

  test("plans the create without a mutation", async () => {
    const recorder = handler()
    const plan = await run(
      recorder.handler,
      Effect.gen(function* planCreate() {
        const api = yield* IssueWriteApi
        return yield* api.planCreate({ title: "Fix login", team: "RAT" })
      }),
      { repositories: seed },
    )
    expect(plan).toEqual({
      team: "RAT",
      title: "Fix login",
      labels: ["enhancement"],
      assignee: "me",
      priority: 3,
    })
    expect(recorder.requests.some((request) => request.query.includes("mutation"))).toBe(false)
  })
})
