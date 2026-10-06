import type { Handler } from "@test/fake-linear/model"

import { apiLayer } from "@test/fake-linear"
import { recordingConsole } from "@test/recording-console"
import { Console, Effect, FileSystem, Layer, Path, Stdio, Terminal } from "effect"
import { Command } from "effect/cli"
import { ChildProcessSpawner } from "effect/process"

import { projectCommand } from "@/cli/project"

const tracker = { id: "project-1", name: "Tracker", progress: 0.5, status: { name: "Started" } }

const cliLayer = (
  handler: Handler,
  args: readonly string[],
  lines: string[],
  readLine: Effect.Effect<string, Terminal.QuitError> = Effect.die("unused"),
) =>
  Layer.mergeAll(
    apiLayer(handler, { stdio: { args: Effect.succeed(args) } }),
    FileSystem.layerNoop({}),
    Path.layer,
    Stdio.layerTest({ args: Effect.succeed(args) }),
    Layer.succeed(
      Terminal.Terminal,
      Terminal.make({
        columns: Effect.succeed(80),
        rows: Effect.succeed(24),
        readInput: Effect.die("unused"),
        readLine,
        display: () => Effect.void,
      }),
    ),
    Layer.succeed(
      ChildProcessSpawner.ChildProcessSpawner,
      ChildProcessSpawner.make(() => Effect.die("unused")),
    ),
    Layer.succeed(Console.Console, recordingConsole(lines)),
  )

const runProject = (
  handler: Handler,
  args: readonly string[],
  lines: string[],
  readLine: Effect.Effect<string, Terminal.QuitError> = Effect.die("unused"),
) =>
  Command.run(projectCommand, { version: "test" }).pipe(
    Effect.provide(cliLayer(handler, args, lines, readLine)),
    Effect.runPromise,
  )

const lastJson = (lines: readonly string[]): unknown => JSON.parse(lines.at(-1) ?? "")

export { cliLayer, lastJson, runProject, tracker }
