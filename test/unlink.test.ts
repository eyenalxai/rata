import type { RepositorySeed } from "@test/database-harness"
import type { Handler } from "@test/fake-linear-model"

import { apiLayer } from "@test/fake-linear"
import { defaultEnv } from "@test/fake-linear-model"
import { recordingConsole } from "@test/recording-console"
import { afterEach, describe, expect, test } from "bun:test"
import { Console, Effect, FileSystem, Layer, Option, Path, Stdio, Terminal } from "effect"
import { Command } from "effect/cli"
import { ChildProcessSpawner } from "effect/process"
import path from "node:path"

import type { RepoConfig } from "@/config/repo"

import { unlinkCommand } from "@/cli/unlink"
import { currentDirectory, RepoConfigService } from "@/config/repo"

const unusedHandler: Handler = () => {
  throw new Error("unlink must not call the Linear API")
}

const terminal = Terminal.make({
  columns: Effect.succeed(80),
  rows: Effect.succeed(24),
  readInput: Effect.die("unused"),
  readLine: Effect.die("unused"),
  display: () => Effect.void,
})

const runUnlink = (
  args: readonly string[],
  lines: string[],
  repositories: readonly RepositorySeed[] = [],
): Promise<Option.Option<RepoConfig>> =>
  Effect.gen(function* unlink() {
    yield* Command.run(unlinkCommand, { version: "test" })
    const repoConfig = yield* RepoConfigService
    const directory = yield* currentDirectory
    return yield* repoConfig.read(directory)
  }).pipe(
    Effect.provide(
      Layer.mergeAll(
        apiLayer(unusedHandler, {
          env: defaultEnv,
          repositories,
          stdio: { args: Effect.succeed(args) },
        }),
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

afterEach(() => {
  process.exitCode = 0
})

describe("unlink", () => {
  test("removes the link and prints what it removed", async () => {
    const lines: string[] = []
    const stored = await runUnlink([], lines, [
      { key: process.cwd(), team: "RAT", project: "rata" },
    ])
    expect(lines).toEqual(["Unlinked RAT from this repository."])
    expect(stored).toEqual(Option.none())
  })

  test("removes the link of a stored ancestor outside Git", async () => {
    const lines: string[] = []
    const stored = await runUnlink([], lines, [{ key: path.dirname(process.cwd()), team: "RAT" }])
    expect(lines).toEqual(["Unlinked RAT from this repository."])
    expect(stored).toEqual(Option.none())
  })

  test("fails when the repository is not linked", async () => {
    const lines: string[] = []
    await runUnlink([], lines)
    expect(lines).toEqual(["error: No repository link. Run `rata link` to link this repository."])
    expect(process.exitCode).toBe(1)
  })

  test("prints the removed link as JSON", async () => {
    const lines: string[] = []
    const stored = await runUnlink(["--json"], lines, [
      { key: process.cwd(), team: "RAT", project: "rata", workspace: "work" },
    ])
    expect(JSON.parse(lines.at(-1) ?? "")).toEqual({
      team: "RAT",
      project: "rata",
      workspace: "work",
    })
    expect(stored).toEqual(Option.none())
  })
})
