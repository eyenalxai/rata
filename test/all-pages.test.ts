import type { Handler } from "@test/fake-linear/model"

import { cliLayer, lastJson, runIssue, runRoot } from "@test/cli-harness"
import { makeFakeLinear } from "@test/fake-linear"
import { readRequest } from "@test/fake-linear/model"
import { jsonResponse, summaryNode } from "@test/issue-fixtures"
import { afterEach, describe, expect, test } from "bun:test"
import { Effect, Option, Schema } from "effect"
import { Command } from "effect/cli"

import { labelCommand } from "@/cli/label"
import { projectCommand } from "@/cli/project"
import { teamCommand } from "@/cli/team"

const teamId = "0f8fad5b-d9cb-469f-a165-70867728950e"
const repositories = [{ key: process.cwd(), team: teamId }]

const team = { id: "team-1", key: "RAT", name: "Rata", timezone: "America/Los_Angeles" }
const otherTeam = { id: "team-2", key: "OPS", name: "Operations", timezone: "America/New_York" }

const projects = [
  { id: "project-1", name: "Tracker", progress: 0.5, status: { name: "Started" }, trashed: false },
  { id: "project-2", name: "Login", progress: 0, status: { name: "Backlog" }, trashed: false },
]

const labels = [
  { id: "label-1", name: "ready-for-agent", color: "#111111", teamId: "team-1" },
  { id: "label-2", name: "bug", color: "#EB5757", teamId: "team-1" },
]

const runTeam = (handler: Handler, args: readonly string[], lines: string[]) =>
  Command.run(teamCommand, { version: "test" }).pipe(
    Effect.provide(cliLayer(handler, args, lines)),
    Effect.runPromise,
  )

const runProject = (handler: Handler, args: readonly string[], lines: string[]) =>
  Command.run(projectCommand, { version: "test" }).pipe(
    Effect.provide(cliLayer(handler, args, lines, repositories)),
    Effect.runPromise,
  )

const runLabel = (handler: Handler, args: readonly string[], lines: string[]) =>
  Command.run(labelCommand, { version: "test" }).pipe(
    Effect.provide(cliLayer(handler, args, lines)),
    Effect.runPromise,
  )

const teamResponse = () =>
  jsonResponse({
    data: { teams: { nodes: [team], pageInfo: { hasNextPage: false, endCursor: null } } },
  })

const pagedIssueHandler =
  (requests: Record<string, unknown>[]): Handler =>
  (request) => {
    const body = readRequest(request)
    requests.push(body.variables)
    if (body.query.includes("query TeamByKey")) {
      return teamResponse()
    }
    const second = body.variables.after === "cursor-1"
    return jsonResponse({
      data: {
        issues: {
          nodes: [summaryNode(second ? "RAT-2" : "RAT-1")],
          pageInfo: second
            ? { hasNextPage: false, endCursor: "cursor-2" }
            : { hasNextPage: true, endCursor: "cursor-1" },
        },
      },
    })
  }

const pagedSearchHandler =
  (requests: Record<string, unknown>[]): Handler =>
  (request) => {
    const body = readRequest(request)
    requests.push(body.variables)
    if (body.query.includes("query TeamByKey")) {
      return teamResponse()
    }
    const second = body.variables.after === "cursor-1"
    return jsonResponse({
      data: {
        searchIssues: {
          nodes: [summaryNode(second ? "RAT-2" : "RAT-1")],
          pageInfo: second
            ? { hasNextPage: false, endCursor: "cursor-2" }
            : { hasNextPage: true, endCursor: "cursor-1" },
        },
      },
    })
  }

const pagedPriorityHandler =
  (requests: Record<string, unknown>[]): Handler =>
  (request) => {
    const body = readRequest(request)
    requests.push(body.variables)
    if (body.query.includes("query TeamByKey")) {
      return teamResponse()
    }
    const second = body.variables.after === "cursor-1"
    return jsonResponse({
      data: {
        issues: {
          nodes: [
            second
              ? { ...summaryNode("RAT-2"), priority: 1 }
              : { ...summaryNode("RAT-1"), priority: 4 },
          ],
          pageInfo: second
            ? { hasNextPage: false, endCursor: "cursor-2" }
            : { hasNextPage: true, endCursor: "cursor-1" },
        },
      },
    })
  }

const syntheticPageInfo = { hasNextPage: false, endCursor: null }

const IssuePageDocument = Schema.Struct({
  issues: Schema.Array(Schema.Struct({ identifier: Schema.String })),
  pageInfo: Schema.Unknown,
})

const IssueListDocument = Schema.Struct({
  issues: Schema.Array(Schema.Struct({ identifier: Schema.String })),
})

const pageDocumentOf = (lines: readonly string[]) =>
  Option.getOrThrow(Schema.decodeUnknownOption(IssuePageDocument)(lastJson(lines)))

const listDocumentOf = (lines: readonly string[]) =>
  Option.getOrThrow(Schema.decodeUnknownOption(IssueListDocument)(lastJson(lines)))

afterEach(() => {
  process.exitCode = 0
})

describe("team list --all", () => {
  test("drains every page and returns synthetic pageInfo", async () => {
    const fake = makeFakeLinear({ teams: [team, otherTeam], labels: [] })
    const lines: string[] = []
    await runTeam(fake.handler, ["list", "--all", "--limit", "1", "--json"], lines)

    expect(lastJson(lines)).toEqual({ teams: [team, otherTeam], pageInfo: syntheticPageInfo })
    expect(fake.requests.map((request) => request.variables)).toEqual([
      { first: 1, after: null },
      { first: 1, after: "team-1" },
    ])
  })

  test("suppresses the human next-page hint", async () => {
    const fake = makeFakeLinear({ teams: [team, otherTeam], labels: [] })
    const lines: string[] = []
    await runTeam(fake.handler, ["list", "--all", "--limit", "1"], lines)

    expect(lines.flatMap((line) => line.split("\n"))).toEqual([
      "RAT\tRata\tteam-1",
      "OPS\tOperations\tteam-2",
    ])
  })

  test("drains from --after", async () => {
    const fake = makeFakeLinear({ teams: [team, otherTeam], labels: [] })
    const lines: string[] = []
    await runTeam(
      fake.handler,
      ["list", "--all", "--after", "team-1", "--limit", "1", "--json"],
      lines,
    )

    expect(lastJson(lines)).toEqual({
      teams: [otherTeam],
      pageInfo: syntheticPageInfo,
    })
    expect(fake.requests[0]?.variables).toEqual({ first: 1, after: "team-1" })
  })
})

describe("project list --all", () => {
  test("drains every page and returns synthetic pageInfo", async () => {
    const fake = makeFakeLinear({ teams: [], labels: [], projects })
    const lines: string[] = []
    await runProject(fake.handler, ["list", "--all", "--limit", "1", "--json"], lines)

    expect(lastJson(lines)).toEqual({ projects, pageInfo: syntheticPageInfo })
    const pages = fake.requests.filter((request) => request.query.includes("query Projects"))
    expect(pages.map((request) => request.variables.after)).toEqual([null, "project-1"])
    expect(pages.map((request) => request.variables.first)).toEqual([1, 1])
  })
})

describe("label list --all", () => {
  test("drains every page and returns synthetic pageInfo", async () => {
    const fake = makeFakeLinear({ teams: [team], labels })
    const lines: string[] = []
    await runLabel(
      fake.handler,
      ["list", "--team", "RAT", "--all", "--limit", "1", "--json"],
      lines,
    )

    expect(lastJson(lines)).toEqual({
      labels: labels.map(({ id, name, color }) => ({ id, name, color })),
      pageInfo: syntheticPageInfo,
    })
    const pages = fake.requests.filter((request) => request.query.includes("query Labels"))
    expect(pages.map((request) => request.variables.after)).toEqual([null, "label-1"])
  })
})

describe("issue list --all", () => {
  test("drains every page and returns synthetic pageInfo", async () => {
    const requests: Record<string, unknown>[] = []
    const lines: string[] = []
    await runIssue(pagedIssueHandler(requests), ["list", "--all", "--limit", "1", "--json"], lines)

    const document = pageDocumentOf(lines)
    expect(document.issues.map((issue) => issue.identifier)).toEqual(["RAT-1", "RAT-2"])
    expect(document.pageInfo).toEqual(syntheticPageInfo)
    const pages = requests.filter((variables) => "filter" in variables)
    expect(pages.map((variables) => variables.after)).toEqual([null, "cursor-1"])
    expect(pages.map((variables) => variables.first)).toEqual([1, 1])
  })

  test("drains from --after", async () => {
    const requests: Record<string, unknown>[] = []
    const lines: string[] = []
    await runIssue(
      pagedIssueHandler(requests),
      ["list", "--all", "--after", "cursor-1", "--json"],
      lines,
    )

    const document = listDocumentOf(lines)
    expect(document.issues.map((issue) => issue.identifier)).toEqual(["RAT-2"])
    const pages = requests.filter((variables) => "filter" in variables)
    expect(pages).toHaveLength(1)
    expect(pages[0]?.after).toBe("cursor-1")
  })

  test("suppresses the human next-page hint", async () => {
    const requests: Record<string, unknown>[] = []
    const lines: string[] = []
    await runIssue(pagedIssueHandler(requests), ["list", "--all", "--limit", "1"], lines)

    expect(lines.flatMap((line) => line.split("\n"))).toHaveLength(2)
    expect(lines.join("\n")).not.toContain("More issues available")
  })

  test("composes with --sort without limiting the total", async () => {
    const requests: Record<string, unknown>[] = []
    const lines: string[] = []
    await runIssue(
      pagedPriorityHandler(requests),
      ["list", "--all", "--sort", "priority", "--limit", "1", "--json"],
      lines,
    )

    const document = pageDocumentOf(lines)
    expect(document.issues.map((issue) => issue.identifier)).toEqual(["RAT-2", "RAT-1"])
  })
})

describe("search --all", () => {
  test("drains every page and returns synthetic pageInfo", async () => {
    const requests: Record<string, unknown>[] = []
    const lines: string[] = []
    await runRoot(
      pagedSearchHandler(requests),
      ["search", "login", "--all", "--limit", "1", "--json"],
      lines,
    )

    const document = pageDocumentOf(lines)
    expect(document.issues.map((issue) => issue.identifier)).toEqual(["RAT-1", "RAT-2"])
    expect(document.pageInfo).toEqual(syntheticPageInfo)
    const pages = requests.filter((variables) => "term" in variables)
    expect(pages.map((variables) => variables.after)).toEqual([null, "cursor-1"])
    expect(pages.map((variables) => variables.first)).toEqual([1, 1])
  })
})
