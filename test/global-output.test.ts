import type { Handler } from "@test/fake-linear/model"

import { cliLayer, lastJson, runIssue } from "@test/cli-harness"
import { makeFakeLinear } from "@test/fake-linear"
import { afterEach, describe, expect, test } from "bun:test"
import { Effect } from "effect"
import { Command } from "effect/cli"

import { teamCommand } from "@/cli/team"

const team = { id: "team-1", key: "RAT", name: "Rata", timezone: "America/Los_Angeles" }

const runTeam = (handler: Handler, args: readonly string[], lines: string[]) =>
  Command.run(teamCommand, { version: "test" }).pipe(
    Effect.provide(cliLayer(handler, args, lines, [{ key: process.cwd(), team: "RAT" }])),
    Effect.runPromise,
  )

afterEach(() => {
  process.exitCode = 0
})

describe("global output flags", () => {
  test("accepts --json before the subcommand", async () => {
    const fake = makeFakeLinear({ teams: [team], labels: [] })
    const lines: string[] = []
    await runTeam(fake.handler, ["--json", "list"], lines)
    expect(lastJson(lines)).toEqual({
      teams: [team],
      pageInfo: { hasNextPage: false, endCursor: "team-1" },
    })
  })

  test("accepts --json after the subcommand", async () => {
    const fake = makeFakeLinear({ teams: [team], labels: [] })
    const lines: string[] = []
    await runTeam(fake.handler, ["list", "--json"], lines)
    expect(lastJson(lines)).toEqual({
      teams: [team],
      pageInfo: { hasNextPage: false, endCursor: "team-1" },
    })
  })

  test("selects fields on a read command", async () => {
    const fake = makeFakeLinear({ teams: [team], labels: [] })
    const lines: string[] = []
    await runTeam(fake.handler, ["list", "--json", "--fields", "key,name"], lines)
    expect(lastJson(lines)).toEqual({
      teams: [{ key: "RAT", name: "Rata" }],
      pageInfo: { hasNextPage: false, endCursor: "team-1" },
    })
  })

  test("rejects an unknown field path", async () => {
    const fake = makeFakeLinear({ teams: [team], labels: [] })
    const lines: string[] = []
    await runTeam(fake.handler, ["list", "--json", "--fields", "nope"], lines)
    expect(JSON.parse(lines[0] ?? "")).toMatchObject({
      error: { code: "validation" },
    })
  })

  test("lists the valid paths in the hint of an unknown field path", async () => {
    const fake = makeFakeLinear({ teams: [team], labels: [] })
    const lines: string[] = []
    await runTeam(fake.handler, ["list", "--json", "--fields", "nope"], lines)
    expect(JSON.parse(lines[0] ?? "")).toMatchObject({
      error: { hint: "Valid paths: id, key, name, timezone." },
    })
  })

  test("rejects --fields without --json", async () => {
    const fake = makeFakeLinear({ teams: [team], labels: [] })
    const lines: string[] = []
    await runTeam(fake.handler, ["list", "--fields", "name"], lines)
    expect(lines).toContain("error: --fields requires --json.")
  })

  test("rejects --fields on a write command", async () => {
    const fake = makeFakeLinear({ teams: [team], labels: [] })
    const lines: string[] = []
    await runIssue(
      fake.handler,
      ["label", "add", "RAT-1", "bug", "--json", "--fields", "identifier"],
      lines,
    )
    expect(JSON.parse(lines[0] ?? "")).toMatchObject({
      error: { code: "validation" },
    })
  })
})
