import type { ApiLayerOptions } from "@test/fake-linear"
import type { Handler } from "@test/fake-linear/model"

import { apiLayer } from "@test/fake-linear"
import { recordingConsole } from "@test/recording-console"
import { Console, Effect, FileSystem, Layer, Option, Path, Schema, Stdio, Terminal } from "effect"
import { Command } from "effect/cli"
import { ChildProcessSpawner } from "effect/process"

import { issueCommand } from "@/cli/issue"
import { runCli } from "@/cli/run"

const terminal = Terminal.make({
  columns: Effect.succeed(80),
  rows: Effect.succeed(24),
  readInput: Effect.die("unused"),
  readLine: Effect.die("unused"),
  display: () => Effect.void,
})

type CliOptions = Omit<ApiLayerOptions, "repositories" | "stdio"> & {
  readonly stdio?: Partial<Stdio.Stdio> | undefined
}

const cliLayer = (
  handler: Handler,
  args: readonly string[],
  lines: string[],
  repositories?: ApiLayerOptions["repositories"],
  options: CliOptions = {},
) => {
  const { stdio, ...rest } = options
  const stdioOptions = { ...stdio, args: Effect.succeed(args) }
  return Layer.mergeAll(
    apiLayer(handler, {
      ...rest,
      stdio: stdioOptions,
      ...(repositories === undefined ? {} : { repositories }),
    }),
    FileSystem.layerNoop({}),
    Path.layer,
    Stdio.layerTest(stdioOptions),
    Layer.succeed(Terminal.Terminal, terminal),
    Layer.succeed(
      ChildProcessSpawner.ChildProcessSpawner,
      ChildProcessSpawner.make(() => Effect.die("unused")),
    ),
    Layer.succeed(Console.Console, recordingConsole(lines)),
  )
}

const lastJson = (lines: readonly string[]): unknown => JSON.parse(lines.at(-1) ?? "")

const lastJsonRecord = (lines: readonly string[]): Record<string, unknown> =>
  Option.getOrThrow(
    Schema.decodeUnknownOption(Schema.Record(Schema.String, Schema.Unknown))(lastJson(lines)),
  )

const defaultRepositories: ApiLayerOptions["repositories"] = [{ key: process.cwd(), team: "RAT" }]

const runIssue = (
  handler: Handler,
  args: readonly string[],
  lines: string[],
  repositories: ApiLayerOptions["repositories"] = defaultRepositories,
  options: CliOptions = {},
) =>
  Command.run(issueCommand, { version: "test" }).pipe(
    Effect.provide(cliLayer(handler, args, lines, repositories, options)),
    Effect.runPromise,
  )

const runRoot = (
  handler: Handler,
  args: readonly string[],
  lines: string[],
  repositories: ApiLayerOptions["repositories"] = defaultRepositories,
  options: CliOptions = {},
) =>
  runCli("test").pipe(
    Effect.provide(cliLayer(handler, args, lines, repositories, options)),
    Effect.runPromise,
  )

export { cliLayer, lastJson, lastJsonRecord, runIssue, runRoot }
