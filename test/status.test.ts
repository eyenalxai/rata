import type { ApiLayerOptions } from "@test/fake-linear"
import type { Handler } from "@test/fake-linear/model"

import { apiLayer, makeFakeLinear } from "@test/fake-linear"
import { defaultViewer } from "@test/fake-linear/model"
import { recordingConsole } from "@test/recording-console"
import { afterEach, describe, expect, test } from "bun:test"
import { Console, Effect, FileSystem, Layer, Option, Path, Schema, Stdio, Terminal } from "effect"
import { Command } from "effect/cli"
import { ChildProcessSpawner } from "effect/process"

import { statusCommand } from "@/cli/status"

const unusedHandler: Handler = () => {
  throw new Error("status must not call the Linear API without a key")
}

const terminal = Terminal.make({
  columns: Effect.succeed(80),
  rows: Effect.succeed(24),
  readInput: Effect.die("unused"),
  readLine: Effect.die("unused"),
  display: () => Effect.void,
})

const runStatus = (
  handler: Handler,
  args: readonly string[],
  lines: string[],
  options: ApiLayerOptions = {},
) =>
  Command.run(statusCommand, { version: "test" }).pipe(
    Effect.provide(
      Layer.mergeAll(
        apiLayer(handler, { ...options, stdio: { args: Effect.succeed(args) } }),
        FileSystem.layerNoop({}),
        Path.layer,
        Stdio.layerTest({ args: Effect.succeed(args) }),
        Layer.succeed(Terminal.Terminal, terminal),
        Layer.succeed(
          ChildProcessSpawner.ChildProcessSpawner,
          ChildProcessSpawner.make(() => Effect.die("unused")),
        ),
        Layer.succeed(Console.Console, recordingConsole(lines)),
      ),
    ),
    Effect.runPromise,
  )

const lastJson = (lines: readonly string[]): unknown => JSON.parse(lines.at(-1) ?? "")

const WorkspaceOnly = Schema.Struct({
  workspace: Schema.Struct({
    name: Schema.NullOr(Schema.String),
    keySource: Schema.String,
  }),
})

const ErrorEnvelope = Schema.Struct({
  error: Schema.Struct({ code: Schema.String }),
})

const team = { id: "team-1", key: "RAT", name: "Rata", timezone: "America/Los_Angeles" }

const statusViewer = {
  id: defaultViewer.id,
  name: defaultViewer.name,
  displayName: defaultViewer.displayName,
  email: defaultViewer.email,
  organization: defaultViewer.organization,
}

const profiles = [
  { name: "default", apiKey: "default-key", isDefault: true },
  { name: "work", apiKey: "work-key" },
]

afterEach(() => {
  process.exitCode = 0
})

describe("status", () => {
  test("prefers the environment key over the repository profile", async () => {
    const fake = makeFakeLinear({ teams: [team], labels: [] })
    const lines: string[] = []
    await runStatus(fake.handler, ["--json"], lines, {
      profiles,
      repositories: [{ key: process.cwd(), team: "RAT", workspace: "work" }],
    })

    expect(lastJson(lines)).toEqual({
      repository: { root: process.cwd(), linked: true },
      workspace: { name: null, keySource: "env" },
      viewer: statusViewer,
      team: { id: "team-1", key: "RAT", name: "Rata" },
      project: null,
      defaults: null,
    })
  })

  test("uses the repository profile and shows the linked team and project", async () => {
    const fake = makeFakeLinear({ teams: [team], labels: [] })
    const lines: string[] = []
    await runStatus(fake.handler, ["--json"], lines, {
      env: { HOME: "/home/test" },
      profiles,
      repositories: [{ key: process.cwd(), team: "RAT", project: "rata", workspace: "work" }],
    })

    expect(lastJson(lines)).toEqual({
      repository: { root: process.cwd(), linked: true },
      workspace: { name: "work", keySource: "repo" },
      viewer: statusViewer,
      team: { id: "team-1", key: "RAT", name: "Rata" },
      project: "rata",
      defaults: null,
    })
  })

  test("falls back to the default profile", async () => {
    const fake = makeFakeLinear({ teams: [team], labels: [] })
    const lines: string[] = []
    await runStatus(fake.handler, ["--json"], lines, {
      env: { HOME: "/home/test" },
      profiles,
      repositories: [{ key: process.cwd(), team: "RAT" }],
    })

    const document = Option.getOrThrow(Schema.decodeUnknownOption(WorkspaceOnly)(lastJson(lines)))
    expect(document.workspace).toEqual({ name: "default", keySource: "default" })
  })

  test("prints the unlinked team line and exits 0", async () => {
    const fake = makeFakeLinear({ teams: [team], labels: [] })
    const lines: string[] = []
    await runStatus(fake.handler, [], lines, { profiles })

    expect(lines[0]).toContain("team:      not linked (run rata link)")
    expect(lines[0]).toContain("defaults:  none")
    expect(process.exitCode).toBe(0)
  })

  test("fails with an auth error when no key exists", async () => {
    const lines: string[] = []
    await runStatus(unusedHandler, ["--json"], lines, {
      env: { HOME: "/home/test" },
      profiles: [],
    })

    const error = Option.getOrThrow(Schema.decodeUnknownOption(ErrorEnvelope)(lastJson(lines)))
    expect(error.error.code).toBe("auth")
    expect(process.exitCode).toBe(1)
  })

  test("selects fields on the whole document", async () => {
    const fake = makeFakeLinear({ teams: [team], labels: [] })
    const lines: string[] = []
    await runStatus(fake.handler, ["--json", "--fields", "repository.root,team.key"], lines, {
      profiles,
      repositories: [{ key: process.cwd(), team: "RAT" }],
    })

    expect(lastJson(lines)).toEqual({
      repository: { root: process.cwd() },
      team: { key: "RAT" },
    })
  })
})
