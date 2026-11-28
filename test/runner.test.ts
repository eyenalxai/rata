import { recordingConsoleWithErrors } from "@test/recording-console"
import { describe, expect, test } from "bun:test"
import { Console, Effect, FileSystem, Layer, Option, Path, Stdio, Terminal } from "effect"
import { Command, Flag } from "effect/cli"
import { ChildProcessSpawner } from "effect/process"

import { arrayField, objectField, scalarField } from "@/cli/field/shape"
import { OutputFields } from "@/cli/fields"
import { helpLayer } from "@/cli/help"
import { ifUnchangedFlag } from "@/cli/input"
import { JsonOutput, dryRunFlag } from "@/cli/output"
import { Format, OutputSelect, buildCommand, buildGroup, runCli } from "@/cli/runner"
import { defineCommand, selectOutput } from "@/cli/spec"
import { TrackerError } from "@/domain/error"

const echoShape = objectField({
  name: scalarField,
  labels: arrayField(objectField({ name: scalarField })),
})

const echoSpec = defineCommand("echo", {
  summary: "Echo a name",
  input: { name: Flag.String("name") },
  output: selectOutput(echoShape),
  run: (input) =>
    Effect.succeed({
      kind: "resource",
      value: {
        name: input.name,
        labels: [{ name: "first" }, { name: "second" }],
      },
      text: [`name: ${input.name}`],
    }),
})

const dryRunSpec = defineCommand("dry-run", {
  summary: "Report the dry-run flag",
  input: { dryRun: dryRunFlag },
  control: (input) => ({ dryRun: input.dryRun }),
  output: selectOutput(objectField({ dryRun: scalarField })),
  run: (_input, control) =>
    Effect.succeed({
      kind: "resource",
      value: { dryRun: control.dryRun },
      text: [`dryRun: ${control.dryRun}`],
    }),
})

const unchangedSpec = defineCommand("unchanged", {
  summary: "Report the snapshot",
  input: { ifUnchanged: ifUnchangedFlag },
  control: (input) => ({ ifUnchanged: input.ifUnchanged }),
  output: selectOutput(objectField({ ifUnchanged: scalarField })),
  run: (_input, control) =>
    Effect.succeed({
      kind: "resource",
      value: { ifUnchanged: Option.getOrNull(control.ifUnchanged) },
      text: [`ifUnchanged: ${Option.getOrElse(control.ifUnchanged, () => "")}`],
    }),
})

const failureCodes = [
  "usage",
  "validation",
  "not_linked",
  "ambiguous",
  "not_found",
  "conflict",
  "auth",
  "forbidden",
  "rate_limited",
  "network",
  "internal",
] as const

const failSpec = defineCommand("fail", {
  summary: "Fail with a tracker error",
  input: { code: Flag.Literals("code", failureCodes) },
  output: selectOutput(objectField({ error: scalarField })),
  run: (input) =>
    Effect.fail(
      new TrackerError({
        code: input.code,
        message: `failed with ${input.code}`,
        hint: null,
      }),
    ),
})

const testGroup = buildGroup("test", "Runner test commands", [
  buildCommand(echoSpec),
  buildCommand(dryRunSpec),
  buildCommand(unchangedSpec),
  buildCommand(failSpec),
]).pipe(Command.withGlobalFlags([Format, OutputSelect, JsonOutput, OutputFields]))

const terminal = Terminal.make({
  columns: Effect.succeed(80),
  rows: Effect.succeed(24),
  readInput: Effect.die("unused"),
  readLine: Effect.die("unused"),
  display: () => Effect.void,
})

type RunOptions = {
  readonly stdoutIsTerminal?: boolean
  readonly files?: ReadonlyMap<string, string>
}

const testLayer = (
  args: readonly string[],
  output: string[],
  errors: string[],
  options: RunOptions = {},
) =>
  Layer.mergeAll(
    FileSystem.layerNoop({
      readFileString: (file) => Effect.succeed(options.files?.get(file) ?? ""),
    }),
    Path.layer,
    Stdio.layerTest({
      args: Effect.succeed(args),
      stdoutIsTerminal: Effect.succeed(options.stdoutIsTerminal ?? false),
    }),
    Layer.succeed(Terminal.Terminal, terminal),
    Layer.succeed(
      ChildProcessSpawner.ChildProcessSpawner,
      ChildProcessSpawner.make(() => Effect.die("unused")),
    ),
    Layer.succeed(Console.Console, recordingConsoleWithErrors(output, errors)),
    helpLayer,
  )

const run = (
  args: readonly string[],
  output: string[],
  options: RunOptions = {},
  errors: string[] = output,
) =>
  runCli("test", testGroup).pipe(
    Effect.provide(testLayer(args, output, errors, options)),
    Effect.runPromise,
  )

const runRoot = (
  args: readonly string[],
  output: string[],
  options: RunOptions = {},
  errors: string[] = output,
) =>
  runCli("test", testGroup).pipe(
    Effect.provide(testLayer(args, output, errors, options)),
    Effect.runPromise,
  )

const lastJson = (lines: readonly string[]): unknown => JSON.parse(lines.at(-1) ?? "")

describe("the command runner", () => {
  test("rejects selectable without outputFor", () => {
    expect(() =>
      defineCommand("bad-select", {
        summary: "Bad selectable",
        input: {},
        selectable: true,
        output: selectOutput(objectField({ name: scalarField })),
        run: () => Effect.succeed({ kind: "text", lines: [] }),
      }),
    ).toThrow("selectable and outputFor must be set together.")
  })

  test("prints JSON when stdout is not a terminal", async () => {
    const lines: string[] = []
    await run(["echo", "--name", "Ada"], lines)

    expect(lastJson(lines)).toEqual({
      name: "Ada",
      labels: [{ name: "first" }, { name: "second" }],
    })
  })

  test("prints text when stdout is a terminal", async () => {
    const lines: string[] = []
    await run(["echo", "--name", "Ada"], lines, { stdoutIsTerminal: true })

    expect(lines).toEqual(["name: Ada"])
  })

  test("--format text forces text off a terminal", async () => {
    const lines: string[] = []
    await run(["echo", "--name", "Ada", "--format", "text"], lines)

    expect(lines).toEqual(["name: Ada"])
  })

  test("--select projects a declared shape and crosses arrays", async () => {
    const lines: string[] = []
    await run(["echo", "--name", "Ada", "--select", "labels.name"], lines)

    expect(lastJson(lines)).toEqual({ labels: ["first", "second"] })
  })

  test("--select implies JSON on a terminal", async () => {
    const lines: string[] = []
    await run(["echo", "--name", "Ada", "--select", "name"], lines, {
      stdoutIsTerminal: true,
    })

    expect(lastJson(lines)).toEqual({ name: "Ada" })
  })

  test("--dry-run reaches the command through the control", async () => {
    const lines: string[] = []
    await run(["dry-run", "--dry-run"], lines)

    expect(lastJson(lines)).toEqual({ dryRun: true })
  })

  test("--if-unchanged reaches the command through the control", async () => {
    const lines: string[] = []
    await run(["unchanged", "--if-unchanged", "2025-01-01T09:00:00.000Z"], lines)

    expect(lastJson(lines)).toEqual({ ifUnchanged: "2025-01-01T09:00:00.000Z" })
  })

  test("rejects --select on a terminal with --format text", async () => {
    const lines: string[] = []
    const errors: string[] = []
    const exit = await run(
      ["echo", "--name", "Ada", "--format", "text", "--select", "name"],
      lines,
      { stdoutIsTerminal: true },
      errors,
    )

    expect(errors.join("\n")).toContain("--select requires JSON output.")
    expect(exit.code).toBe(2)
  })

  test("a select parse error on a terminal writes one JSON error and no help", async () => {
    const lines: string[] = []
    const errors: string[] = []
    const exit = await run(
      ["echo", "--name", "Ada", "--select", "nope"],
      lines,
      {
        stdoutIsTerminal: true,
      },
      errors,
    )

    expect(lines).toEqual([])
    expect(errors).toHaveLength(1)
    expect(lastJson(errors)).toMatchObject({ error: { code: "validation" } })
    expect(exit.code).toBe(2)
  })

  test("a parse error writes one usage error object and no help", async () => {
    const lines: string[] = []
    const errors: string[] = []
    const exit = await runRoot(["echo", "--bogus", "--json"], lines, {}, errors)

    expect(lines).toEqual([])
    expect(errors).toHaveLength(1)
    expect(lastJson(errors)).toMatchObject({ error: { code: "usage" } })
    expect(exit.code).toBe(2)
  })

  test("maps every exit code", async () => {
    const cases = [
      { args: ["echo", "--name", "Ada"], exitCode: 0 },
      { args: ["fail", "--code", "internal"], exitCode: 1 },
      { args: ["fail", "--code", "usage"], exitCode: 2 },
      { args: ["fail", "--code", "not_found"], exitCode: 3 },
      { args: ["fail", "--code", "conflict"], exitCode: 4 },
      { args: ["fail", "--code", "auth"], exitCode: 5 },
      { args: ["fail", "--code", "rate_limited"], exitCode: 6 },
    ] as const

    const check = async (index: number): Promise<void> => {
      const item = cases[index]
      if (item === undefined) {
        return
      }
      const exit = await run(item.args, [])
      expect(exit.code).toBe(item.exitCode)
      await check(index + 1)
    }
    await check(0)
  })
})
