import type { Handler } from "@test/fake-linear-model"

import { cliLayer, lastJson } from "@test/cli-harness"
import { makeFakeLinear } from "@test/fake-linear"
import { jsonResponse, readRequest } from "@test/fake-linear-model"
import { summaryNode } from "@test/issue-fixtures"
import { afterEach, describe, expect, test } from "bun:test"
import { Effect } from "effect"
import { Command } from "effect/cli"

import { issueCommand, searchCommand } from "@/cli/issue"
import { labelCommand } from "@/cli/label"
import { projectCommand } from "@/cli/project"
import { teamCommand } from "@/cli/team"

const team = { id: "team-1", key: "RAT", name: "Rata", timezone: "America/Los_Angeles" }
const otherTeam = { id: "team-2", key: "OPS", name: "Operations", timezone: "America/New_York" }

const runTeam = (handler: Handler, args: readonly string[], lines: string[]) =>
  Command.run(teamCommand, { version: "test" }).pipe(
    Effect.provide(cliLayer(handler, args, lines)),
    Effect.runPromise,
  )

const runProject = (handler: Handler, args: readonly string[], lines: string[]) =>
  Command.run(projectCommand, { version: "test" }).pipe(
    Effect.provide(cliLayer(handler, args, lines)),
    Effect.runPromise,
  )

const runLabel = (handler: Handler, args: readonly string[], lines: string[]) =>
  Command.run(labelCommand, { version: "test" }).pipe(
    Effect.provide(cliLayer(handler, args, lines)),
    Effect.runPromise,
  )

const runIssue = (handler: Handler, args: readonly string[], lines: string[]) =>
  Command.run(issueCommand, { version: "test" }).pipe(
    Effect.provide(cliLayer(handler, args, lines)),
    Effect.runPromise,
  )

const runSearch = (handler: Handler, args: readonly string[], lines: string[]) =>
  Command.run(searchCommand, { version: "test" }).pipe(
    Effect.provide(cliLayer(handler, args, lines)),
    Effect.runPromise,
  )

const issuePageHandler: Handler = () =>
  jsonResponse({
    data: {
      issues: {
        nodes: [summaryNode("RAT-1")],
        pageInfo: { hasNextPage: true, endCursor: "cursor-1" },
      },
    },
  })

afterEach(() => {
  process.exitCode = 0
})

describe("team list pages", () => {
  test("returns one page with pageInfo and continues from --after", async () => {
    const fake = makeFakeLinear({ teams: [team, otherTeam], labels: [] })
    const first: string[] = []
    await runTeam(fake.handler, ["list", "--limit", "1", "--json"], first)
    expect(lastJson(first)).toEqual({
      teams: [team],
      pageInfo: { hasNextPage: true, endCursor: "team-1" },
    })

    const second: string[] = []
    await runTeam(fake.handler, ["list", "--limit", "1", "--after", "team-1", "--json"], second)
    expect(lastJson(second)).toEqual({
      teams: [otherTeam],
      pageInfo: { hasNextPage: false, endCursor: "team-2" },
    })
    expect(fake.requests[0]?.variables).toEqual({ first: 1, after: null })
    expect(fake.requests[0]?.query).toContain("orderBy: createdAt")
    expect(fake.requests[1]?.variables).toEqual({ first: 1, after: "team-1" })
  })

  test("prints a next-page hint in the human output", async () => {
    const fake = makeFakeLinear({ teams: [team, otherTeam], labels: [] })
    const lines: string[] = []
    await runTeam(fake.handler, ["list", "--limit", "1"], lines)
    expect(lines.flatMap((line) => line.split("\n"))).toEqual([
      "RAT\tRata\tteam-1",
      "More teams available. Continue with --after team-1",
    ])
  })

  test("rejects --limit above 250 before the API call", async () => {
    const fake = makeFakeLinear({ teams: [team], labels: [] })
    const lines: string[] = []
    await runTeam(fake.handler, ["list", "--limit", "500"], lines)
    expect(lines).toContain("error: The --limit flag must be at most 250.")
    expect(fake.requests).toHaveLength(0)
  })
})

describe("project list pages", () => {
  test("returns one page with pageInfo", async () => {
    const projects = [
      { id: "project-1", name: "Tracker", progress: 0.5, status: { name: "Started" } },
      { id: "project-2", name: "Login", progress: 0, status: { name: "Backlog" } },
    ]
    const fake = makeFakeLinear({ teams: [], labels: [], projects })
    const lines: string[] = []
    await runProject(fake.handler, ["list", "--limit", "1", "--json"], lines)
    expect(lastJson(lines)).toEqual({
      projects: [projects[0]],
      pageInfo: { hasNextPage: true, endCursor: "project-1" },
    })
    expect(fake.requests[0]?.variables).toEqual({ first: 1, after: null })
    expect(fake.requests[0]?.query).toContain("orderBy: createdAt")
  })
})

describe("label list pages", () => {
  test("returns one page with pageInfo", async () => {
    const labels = [
      { id: "label-1", name: "ready-for-agent", color: "#111111", teamId: "team-1" },
      { id: "label-2", name: "bug", color: "#EB5757", teamId: "team-1" },
    ]
    const fake = makeFakeLinear({ teams: [team], labels })
    const lines: string[] = []
    await runLabel(fake.handler, ["list", "--team", "RAT", "--limit", "1", "--json"], lines)
    expect(lastJson(lines)).toEqual({
      labels: [{ id: "label-1", name: "ready-for-agent", color: "#111111" }],
      pageInfo: { hasNextPage: true, endCursor: "label-1" },
    })
    const request = fake.requests.find((entry) => entry.query.includes("query Labels"))
    expect(request?.variables).toEqual({ teamId: "team-1", first: 1, after: null })
  })

  test("prints the color in the human output", async () => {
    const labels = [
      { id: "label-1", name: "ready-for-agent", color: "#111111", teamId: "team-1" },
      { id: "label-2", name: "bug", color: "#EB5757", teamId: "team-1" },
    ]
    const fake = makeFakeLinear({ teams: [team], labels })
    const lines: string[] = []
    await runLabel(fake.handler, ["list", "--team", "RAT"], lines)
    expect(lines.flatMap((line) => line.split("\n"))).toEqual([
      "ready-for-agent\tlabel-1\t#111111",
      "bug\tlabel-2\t#EB5757",
    ])
  })
})

describe("issue list pages", () => {
  test("prints pure JSON when a next page exists", async () => {
    const lines: string[] = []
    await runIssue(issuePageHandler, ["list", "--json"], lines)
    expect(lines).toHaveLength(1)
    expect(lastJson(lines)).toEqual({
      issues: [expect.objectContaining({ identifier: "RAT-1" })],
      pageInfo: { hasNextPage: true, endCursor: "cursor-1" },
    })
  })
})

describe("issue search pages", () => {
  test("prints pure JSON and continues from --after", async () => {
    const variables: Record<string, unknown>[] = []
    const handler: Handler = (request) => {
      variables.push(readRequest(request).variables)
      return jsonResponse({
        data: {
          searchIssues: {
            nodes: [summaryNode("RAT-1")],
            pageInfo: { hasNextPage: true, endCursor: "cursor-1" },
          },
        },
      })
    }

    const first: string[] = []
    await runSearch(handler, ["login", "--limit", "1", "--json"], first)
    expect(first).toHaveLength(1)
    expect(lastJson(first)).toEqual({
      issues: [expect.objectContaining({ identifier: "RAT-1" })],
      pageInfo: { hasNextPage: true, endCursor: "cursor-1" },
    })
    expect(variables[0]).toEqual({ term: "login", first: 1, after: null })

    const second: string[] = []
    await runSearch(handler, ["login", "--limit", "1", "--after", "cursor-1", "--json"], second)
    expect(lastJson(second)).toEqual({
      issues: [expect.objectContaining({ identifier: "RAT-1" })],
      pageInfo: { hasNextPage: true, endCursor: "cursor-1" },
    })
    expect(variables[1]).toEqual({ term: "login", first: 1, after: "cursor-1" })
  })
})
