import type { Handler } from "@test/fake-linear/model"

import { cliLayer, lastJson, runIssue } from "@test/cli-harness"
import { makeFakeLinear } from "@test/fake-linear"
import { baseDetail, jsonResponse, pageInfo, readBody, withTeamLookup } from "@test/issue-fixtures"
import { afterEach, describe, expect, test } from "bun:test"
import { Effect, Option, Result, Schema } from "effect"
import { Command } from "effect/cli"

import { selectFields } from "@/cli/field/select"
import { arrayField, objectField, scalarField } from "@/cli/field/shape"
import { teamCommand } from "@/cli/team"

const team = {
  id: "team-1",
  key: "RAT",
  name: "Rata",
  timezone: "America/Los_Angeles",
  states: [
    { id: "state-1", name: "Backlog", type: "backlog", position: 1 },
    { id: "state-2", name: "Todo", type: "unstarted", position: 2 },
  ],
}

const repositories = [{ key: process.cwd(), team: "RAT" }]

const runTeam = (handler: Handler, args: readonly string[], lines: string[]) =>
  Command.run(teamCommand, { version: "test" }).pipe(
    Effect.provide(cliLayer(handler, args, lines, repositories)),
    Effect.runPromise,
  )

const detailHandler =
  (detail: unknown): Handler =>
  (request) => {
    const body = readBody(request)
    if (body.query.includes("query IssueComments")) {
      return jsonResponse({ data: { issue: { comments: { nodes: [], pageInfo } } } })
    }
    return jsonResponse({ data: { issue: detail } })
  }

const emptyPageHandler: Handler = withTeamLookup(() =>
  jsonResponse({ data: { issues: { nodes: [], pageInfo } } }),
)

const FieldErrorDocument = Schema.Struct({
  error: Schema.Struct({
    code: Schema.String,
    message: Schema.String,
    hint: Schema.optional(Schema.String),
    details: Schema.Struct({
      path: Schema.String,
      validPaths: Schema.Array(Schema.String),
    }),
  }),
})

const fieldError = (lines: readonly string[]) =>
  Option.getOrThrow(Schema.decodeUnknownOption(FieldErrorDocument)(lastJson(lines)))

afterEach(() => {
  process.exitCode = 0
})

describe("field shape validation", () => {
  test("rejects an unknown path on an empty list", async () => {
    const lines: string[] = []
    await runIssue(emptyPageHandler, ["list", "--json", "--fields", "nope"], lines)

    const error = fieldError(lines)
    expect(error.error.code).toBe("validation")
    expect(error.error.message).toBe("Unknown field path: nope.")
    expect(error.error.details.path).toBe("nope")
    expect(error.error.details.validPaths).toContain("identifier")
    expect(error.error.details.validPaths).toContain("title")
    expect(process.exitCode).toBe(2)
  })

  test("rejects a typo after a null object", async () => {
    const lines: string[] = []
    await runIssue(
      detailHandler({ ...baseDetail, assignee: null }),
      ["show", "RAT-1", "--json", "--fields", "assignee.naem"],
      lines,
    )

    const error = fieldError(lines)
    expect(error.error.code).toBe("validation")
    expect(error.error.message).toBe("Unknown field path: assignee.naem.")
    expect(error.error.hint).toBe("Valid paths: displayName, id, name.")
    expect(error.error.details.path).toBe("assignee.naem")
    expect(error.error.details.validPaths).toEqual(["displayName", "id", "name"])
    expect(process.exitCode).toBe(2)
  })

  test("rejects a path through an array of scalars", () => {
    const shape = objectField({ labels: arrayField(scalarField) })
    const selected = selectFields(shape, { labels: ["bug"] }, [["labels", "name"]])

    expect(Result.isFailure(selected)).toBe(true)
    if (Result.isFailure(selected)) {
      expect(selected.failure.message).toBe("The field path enters the array of scalars labels.")
    }
  })
})

describe("field array projection", () => {
  test("returns state names from a team detail", async () => {
    const fake = makeFakeLinear({ teams: [team], labels: [] })
    const lines: string[] = []
    await runTeam(fake.handler, ["show", "--json", "--fields", "states.name"], lines)

    expect(lastJson(lines)).toEqual({ states: ["Backlog", "Todo"] })
  })

  test("returns label names from an issue detail", async () => {
    const lines: string[] = []
    await runIssue(
      detailHandler(baseDetail),
      ["show", "RAT-1", "--json", "--fields", "labels.name"],
      lines,
    )

    expect(lastJson(lines)).toEqual({ labels: ["ready-for-agent"] })
  })

  test("returns a deeper scalar leaf as an array of scalars", async () => {
    const lines: string[] = []
    await runIssue(
      detailHandler(baseDetail),
      ["show", "RAT-1", "--json", "--fields", "children.state.name"],
      lines,
    )

    expect(lastJson(lines)).toEqual({ children: ["Todo"] })
  })

  test("returns an object leaf as an array of objects", async () => {
    const lines: string[] = []
    await runIssue(
      detailHandler(baseDetail),
      ["show", "RAT-1", "--json", "--fields", "children.state"],
      lines,
    )

    expect(lastJson(lines)).toEqual({
      children: [{ state: { name: "Todo", type: "unstarted" } }],
    })
  })

  test("merges two paths that cross the same array", async () => {
    const lines: string[] = []
    await runIssue(
      detailHandler(baseDetail),
      ["show", "RAT-1", "--json", "--fields", "children.identifier,children.state.name"],
      lines,
    )

    expect(lastJson(lines)).toEqual({
      children: [{ identifier: "RAT-2", state: { name: "Todo" } }],
    })
  })

  test("validates an empty array and returns it", async () => {
    const detail = {
      ...baseDetail,
      labels: { nodes: [], pageInfo },
      children: { nodes: [], pageInfo },
    }
    const lines: string[] = []
    await runIssue(
      detailHandler(detail),
      ["show", "RAT-1", "--json", "--fields", "labels.name,children.state.name"],
      lines,
    )

    expect(lastJson(lines)).toEqual({ labels: [], children: [] })
  })
})
