import type { Handler } from "@test/fake-linear/model"

import { cliLayer, lastJson } from "@test/cli-harness"
import { makeFakeLinear } from "@test/fake-linear"
import { readRequest } from "@test/fake-linear/model"
import { jsonResponse, summaryNode } from "@test/issue-fixtures"
import { afterEach, describe, expect, test } from "bun:test"
import { Effect } from "effect"
import { Command } from "effect/cli"

import { searchCommand } from "@/cli/issue"
import { labelCommand } from "@/cli/label"
import { projectCommand } from "@/cli/project"

const team = { id: "team-1", key: "RAT", name: "Rata", timezone: "America/Los_Angeles" }
const otherTeam = { id: "team-2", key: "OPS", name: "Operations", timezone: "America/New_York" }
const seed = [{ key: process.cwd(), team: "RAT" }]

const runProject = (handler: Handler, args: readonly string[], lines: string[]) =>
  Command.run(projectCommand, { version: "test" }).pipe(
    Effect.provide(cliLayer(handler, args, lines, seed)),
    Effect.runPromise,
  )

const runLabel = (handler: Handler, args: readonly string[], lines: string[]) =>
  Command.run(labelCommand, { version: "test" }).pipe(
    Effect.provide(cliLayer(handler, args, lines, seed)),
    Effect.runPromise,
  )

const runLabelUnlinked = (handler: Handler, args: readonly string[], lines: string[]) =>
  Command.run(labelCommand, { version: "test" }).pipe(
    Effect.provide(cliLayer(handler, args, lines)),
    Effect.runPromise,
  )

const runSearch = (handler: Handler, args: readonly string[], lines: string[]) =>
  Command.run(searchCommand, { version: "test" }).pipe(
    Effect.provide(cliLayer(handler, args, lines, seed)),
    Effect.runPromise,
  )

const runProjectUnlinked = (handler: Handler, args: readonly string[], lines: string[]) =>
  Command.run(projectCommand, { version: "test" }).pipe(
    Effect.provide(cliLayer(handler, args, lines)),
    Effect.runPromise,
  )

const runSearchUnlinked = (handler: Handler, args: readonly string[], lines: string[]) =>
  Command.run(searchCommand, { version: "test" }).pipe(
    Effect.provide(cliLayer(handler, args, lines)),
    Effect.runPromise,
  )

afterEach(() => {
  process.exitCode = 0
})

describe("project list team default", () => {
  test("lists the projects of the linked team without --team", async () => {
    const projects = [
      {
        id: "project-1",
        name: "Tracker",
        progress: 0.5,
        status: { name: "Started" },
        trashed: false,
      },
    ]
    const fake = makeFakeLinear({ teams: [team], labels: [], projects })
    const lines: string[] = []
    await runProject(fake.handler, ["list", "--json"], lines)

    expect(lastJson(lines)).toEqual({
      projects,
      pageInfo: { hasNextPage: false, endCursor: "project-1" },
    })
    const request = fake.requests.find((entry) => entry.query.includes("query Projects"))
    expect(request?.variables.filter).toEqual({
      accessibleTeams: { some: { id: { eq: "team-1" } } },
    })
  })

  test("lets --team override the linked team", async () => {
    const projects = [
      {
        id: "project-1",
        name: "Tracker",
        progress: 0.5,
        status: { name: "Started" },
        trashed: false,
      },
    ]
    const fake = makeFakeLinear({ teams: [team, otherTeam], labels: [], projects })
    const lines: string[] = []
    await runProject(fake.handler, ["list", "--team", "OPS", "--json"], lines)

    const request = fake.requests.find((entry) => entry.query.includes("query Projects"))
    expect(request?.variables.filter).toEqual({
      accessibleTeams: { some: { id: { eq: "team-2" } } },
    })
  })

  test("fails without a link and without --team", async () => {
    const fake = makeFakeLinear({ teams: [team], labels: [], projects: [] })
    const lines: string[] = []
    await runProjectUnlinked(fake.handler, ["list"], lines)

    expect(lines).toContain("error: No team. Pass --team, or run `rata link`.")
    expect(process.exitCode).toBe(1)
  })
})

describe("label list team default", () => {
  test("lists the linked team's labels without --team", async () => {
    const labels = [{ id: "label-1", name: "ready-for-agent", color: "#111111", teamId: "team-1" }]
    const fake = makeFakeLinear({ teams: [team], labels })
    const lines: string[] = []
    await runLabel(fake.handler, ["list", "--json"], lines)

    expect(lastJson(lines)).toEqual({
      labels: [{ id: "label-1", name: "ready-for-agent", color: "#111111" }],
      pageInfo: { hasNextPage: false, endCursor: "label-1" },
    })
    const request = fake.requests.find((entry) => entry.query.includes("query Labels"))
    expect(request?.variables).toEqual({ teamId: "team-1", first: 50, after: null })
  })

  test("lets --team override the linked team", async () => {
    const labels = [
      { id: "label-1", name: "ready-for-agent", color: "#111111", teamId: "team-1" },
      { id: "label-2", name: "bug", color: "#EB5757", teamId: "team-2" },
    ]
    const fake = makeFakeLinear({ teams: [team, otherTeam], labels })
    const lines: string[] = []
    await runLabel(fake.handler, ["list", "--team", "OPS", "--json"], lines)

    const request = fake.requests.find((entry) => entry.query.includes("query Labels"))
    expect(request?.variables).toEqual({ teamId: "team-2", first: 50, after: null })
  })

  test("fails without a link and without --team", async () => {
    const fake = makeFakeLinear({ teams: [team], labels: [] })
    const lines: string[] = []
    await runLabelUnlinked(fake.handler, ["list"], lines)

    expect(lines).toContain("error: No team. Pass --team, or run `rata link`.")
    expect(process.exitCode).toBe(1)
  })
})

describe("issue search pages", () => {
  test("prints pure JSON and continues from --after", async () => {
    const variables: Record<string, unknown>[] = []
    const handler: Handler = (request) => {
      const body = readRequest(request)
      if (body.query.includes("query TeamByKey")) {
        return jsonResponse({
          data: { teams: { nodes: [team], pageInfo: { hasNextPage: false, endCursor: null } } },
        })
      }
      variables.push(body.variables)
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
    expect(variables[0]).toEqual({
      term: "login",
      filter: { team: { id: { eq: "team-1" } } },
      first: 1,
      after: null,
    })

    const second: string[] = []
    await runSearch(handler, ["login", "--limit", "1", "--after", "cursor-1", "--json"], second)
    expect(lastJson(second)).toEqual({
      issues: [expect.objectContaining({ identifier: "RAT-1" })],
      pageInfo: { hasNextPage: true, endCursor: "cursor-1" },
    })
    expect(variables[1]).toEqual({
      term: "login",
      filter: { team: { id: { eq: "team-1" } } },
      first: 1,
      after: "cursor-1",
    })
  })

  test("fails without a link and without --team", async () => {
    const fake = makeFakeLinear({ teams: [team], labels: [] })
    const lines: string[] = []
    await runSearchUnlinked(fake.handler, ["login"], lines)

    expect(lines).toContain("error: No team. Pass --team, or run `rata link`.")
    expect(process.exitCode).toBe(1)
  })
})
