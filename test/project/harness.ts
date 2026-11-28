import type { Handler } from "@test/fake-linear/model"

import { apiLayer } from "@test/fake-linear"
import { recordingConsole } from "@test/recording-console"
import { fakeTerminal } from "@test/terminal-harness"
import { Console, Effect, FileSystem, Layer, Path, Stdio, Terminal } from "effect"
import { ChildProcessSpawner } from "effect/process"

import { projectCommand } from "@/cli/registry"
import { runCli } from "@/cli/runner"
import { projectId } from "@/domain/id"

const tracker = {
  id: projectId("project-1"),
  name: "Tracker",
  progress: 0.5,
  status: { name: "Started" },
}

const cliLayer = (
  handler: Handler,
  args: readonly string[],
  lines: string[],
  input: readonly Terminal.UserInput[] = [],
  stdinIsTerminal = true,
) =>
  Layer.mergeAll(
    apiLayer(handler, { stdio: { args: Effect.succeed(args) } }),
    FileSystem.layerNoop({}),
    Path.layer,
    Stdio.layerTest({
      args: Effect.succeed(args),
      stdinIsTerminal: Effect.succeed(stdinIsTerminal),
      stdoutIsTerminal: Effect.succeed(true),
    }),
    Layer.succeed(Terminal.Terminal, fakeTerminal(input)),
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
  input: readonly Terminal.UserInput[] = [],
  stdinIsTerminal = true,
) =>
  runCli("test", projectCommand).pipe(
    Effect.provide(cliLayer(handler, args, lines, input, stdinIsTerminal)),
    Effect.runPromise,
  )

const lastJson = (lines: readonly string[]): unknown => JSON.parse(lines.at(-1) ?? "")

export { cliLayer, lastJson, runProject, tracker }
