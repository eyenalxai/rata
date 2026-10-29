import type { ApiLayerOptions } from "@test/fake-linear"
import type { Handler } from "@test/fake-linear/model"

import { apiLayer } from "@test/fake-linear"
import { recordingConsole } from "@test/recording-console"
import { Console, Effect, FileSystem, Layer, Path, Stdio, Terminal } from "effect"
import { Command } from "effect/cli"
import { ChildProcessSpawner } from "effect/process"

import { issueCommand } from "@/cli/issue"

const terminal = Terminal.make({
  columns: Effect.succeed(80),
  rows: Effect.succeed(24),
  readInput: Effect.die("unused"),
  readLine: Effect.die("unused"),
  display: () => Effect.void,
})

const cliLayer = (
  handler: Handler,
  args: readonly string[],
  lines: string[],
  repositories?: ApiLayerOptions["repositories"],
) =>
  Layer.mergeAll(
    apiLayer(handler, {
      stdio: { args: Effect.succeed(args) },
      ...(repositories === undefined ? {} : { repositories }),
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
  )

const lastJson = (lines: readonly string[]): unknown => JSON.parse(lines.at(-1) ?? "")

const defaultRepositories: ApiLayerOptions["repositories"] = [{ key: process.cwd(), team: "RAT" }]

const runIssue = (
  handler: Handler,
  args: readonly string[],
  lines: string[],
  repositories: ApiLayerOptions["repositories"] = defaultRepositories,
) =>
  Command.run(issueCommand, { version: "test" }).pipe(
    Effect.provide(cliLayer(handler, args, lines, repositories)),
    Effect.runPromise,
  )

export { cliLayer, lastJson, runIssue }
