import type { Handler } from "@test/fake-linear/model"

import { cliLayer, lastJson, runRoot } from "@test/cli-harness"
import { makeFakeLinear } from "@test/fake-linear"
import { defaultViewer } from "@test/fake-linear/model"
import { afterEach, describe, expect, test } from "bun:test"
import { Effect } from "effect"
import { Command } from "effect/cli"

import { teamCommand } from "@/cli/registry"

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
  test("defaults a migrated command to JSON off a terminal", async () => {
    const fake = makeFakeLinear({ teams: [team], labels: [] })
    const lines: string[] = []
    await Command.run(teamCommand, { version: "test" }).pipe(
      Effect.provide(
        cliLayer(fake.handler, ["list"], lines, [{ key: process.cwd(), team: "RAT" }], {
          stdio: { stdoutIsTerminal: Effect.succeed(false) },
        }),
      ),
      Effect.runPromise,
    )

    expect(lastJson(lines)).toEqual({
      teams: [team],
      pageInfo: { hasNextPage: false, endCursor: "team-1" },
    })
  })

  test("migrates admin auth status to the JSON default off a terminal", async () => {
    const fake = makeFakeLinear({ teams: [team], labels: [] })
    const lines: string[] = []
    await runRoot(fake.handler, ["admin", "auth", "status"], lines, [], {
      stdio: { stdoutIsTerminal: Effect.succeed(false) },
    })

    expect(lastJson(lines)).toMatchObject({
      authenticated: true,
      viewer: {
        name: defaultViewer.name,
        email: defaultViewer.email,
      },
    })
  })

  test("accepts --format before the subcommand", async () => {
    const fake = makeFakeLinear({ teams: [team], labels: [] })
    const lines: string[] = []
    await runTeam(fake.handler, ["--format", "json", "list"], lines)
    expect(lastJson(lines)).toEqual({
      teams: [team],
      pageInfo: { hasNextPage: false, endCursor: "team-1" },
    })
  })

  test("accepts --format after the subcommand", async () => {
    const fake = makeFakeLinear({ teams: [team], labels: [] })
    const lines: string[] = []
    await runTeam(fake.handler, ["list", "--format", "json"], lines)
    expect(lastJson(lines)).toEqual({
      teams: [team],
      pageInfo: { hasNextPage: false, endCursor: "team-1" },
    })
  })

  test("selects fields on a read command", async () => {
    const fake = makeFakeLinear({ teams: [team], labels: [] })
    const lines: string[] = []
    await runTeam(fake.handler, ["list", "--format", "json", "--select", "key,name"], lines)
    expect(lastJson(lines)).toEqual({
      teams: [{ key: "RAT", name: "Rata" }],
      pageInfo: { hasNextPage: false, endCursor: "team-1" },
    })
  })

  test("selects fields on admin auth status", async () => {
    const fake = makeFakeLinear({ teams: [team], labels: [] })
    const lines: string[] = []
    await runRoot(
      fake.handler,
      ["admin", "auth", "status", "--format", "json", "--select", "viewer.name"],
      lines,
    )
    expect(lastJson(lines)).toEqual({ viewer: { name: defaultViewer.name } })
  })

  test("team delete without a TTY exits 2 with a --yes hint", async () => {
    const fake = makeFakeLinear({ teams: [team], labels: [] })
    const lines: string[] = []
    await runTeam(fake.handler, ["delete", "RAT", "--format", "json"], lines)

    expect(process.exitCode).toBe(2)
    expect(JSON.parse(lines.at(-1) ?? "")).toMatchObject({
      error: { code: "validation", hint: "Pass --yes to skip the prompt." },
    })
  })

  test("rejects an unknown field path", async () => {
    const fake = makeFakeLinear({ teams: [team], labels: [] })
    const lines: string[] = []
    await runTeam(fake.handler, ["list", "--format", "json", "--select", "nope"], lines)
    expect(JSON.parse(lines[0] ?? "")).toMatchObject({
      error: { code: "validation" },
    })
  })

  test("lists the valid paths in the hint of an unknown field path", async () => {
    const fake = makeFakeLinear({ teams: [team], labels: [] })
    const lines: string[] = []
    await runTeam(fake.handler, ["list", "--format", "json", "--select", "nope"], lines)
    expect(JSON.parse(lines[0] ?? "")).toMatchObject({
      error: { hint: "Valid paths: id, key, name, timezone." },
    })
  })
})
