import type { ApiLayerOptions } from "@test/fake-linear"
import type { Handler } from "@test/fake-linear/model"

import { apiLayer } from "@test/fake-linear"
import { defaultViewer } from "@test/fake-linear/model"
import { recordingConsoleWithErrors } from "@test/recording-console"
import { Clock, Console, Effect, FileSystem, Layer, Path, Stdio, Terminal } from "effect"
import { Command } from "effect/cli"
import { ChildProcessSpawner } from "effect/process"
import path from "node:path"

import { statusCommand } from "@/cli/status"

const terminal = Terminal.make({
  columns: Effect.succeed(80),
  rows: Effect.succeed(24),
  readInput: Effect.die("unused"),
  readLine: Effect.die("unused"),
  display: () => Effect.void,
})

const statusLayer = (
  handler: Handler,
  args: readonly string[],
  lines: string[],
  options: ApiLayerOptions = {},
  errors: string[] = lines,
) =>
  Layer.mergeAll(
    apiLayer(handler, { ...options, stdio: { args: Effect.succeed(args) } }),
    FileSystem.layerNoop({
      exists: (file) => Effect.succeed((options.files ?? new Map()).has(file)),
      readFileString: (file) => Effect.succeed((options.files ?? new Map()).get(file) ?? ""),
    }),
    Path.layer,
    Stdio.layerTest({ args: Effect.succeed(args) }),
    Layer.succeed(Terminal.Terminal, terminal),
    Layer.succeed(
      ChildProcessSpawner.ChildProcessSpawner,
      ChildProcessSpawner.make(() => Effect.die("unused")),
    ),
    Layer.succeed(Console.Console, recordingConsoleWithErrors(lines, errors)),
  )

const runStatus = (
  handler: Handler,
  args: readonly string[],
  lines: string[],
  options: ApiLayerOptions = {},
  errors: string[] = lines,
) =>
  Command.run(statusCommand, { version: "test" }).pipe(
    Effect.provide(statusLayer(handler, args, lines, options, errors)),
    Effect.runPromise,
  )

const lastJson = (lines: readonly string[]): unknown => JSON.parse(lines.at(-1) ?? "")

const now = (): Promise<number> => Effect.runPromise(Clock.currentTimeMillis)

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

const docsDirectory = path.join(process.cwd(), "docs", "agents")

const missingDocs = {
  tracker: {
    path: path.join(docsDirectory, "issue-tracker.md"),
    exists: false,
    healthy: null,
    warning: null,
  },
  triage: {
    path: path.join(docsDirectory, "triage-labels.md"),
    exists: false,
    healthy: null,
    warning: null,
  },
}

export {
  docsDirectory,
  lastJson,
  missingDocs,
  now,
  profiles,
  runStatus,
  statusLayer,
  statusViewer,
  team,
}
