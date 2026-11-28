import type { Option } from "effect"
import type { Command as CliCommand } from "effect/cli"

import { Console, Effect, Option as OptionValue, Stdio } from "effect"
import { CliError, Command, Flag, GlobalFlag } from "effect/cli"

import type {
  CommandControl,
  CommandOutput,
  CommandSpec,
  OutputFormat,
  RunnerControlInput,
} from "@/cli/spec"

import { dropEmptyLine } from "@/cli/console"
import { commandError, exitCodeOf, toTrackerError } from "@/cli/error-report"
import { OutputFields } from "@/cli/fields"
import {
  formatFromArgs,
  hasNewOutputFlag,
  hasOldOutputFlag,
  helpRequested,
  isBareInvocation,
  isIssueReadCommand,
  isLegacyIssueCommand,
} from "@/cli/format"
import { setSuppressHelp, withModernOutput, withSelectable } from "@/cli/help"
import { readBodyInput } from "@/cli/input"
import { JsonOutput, reportTrackerError } from "@/cli/output"
import { detectInvalidForm, jsonEnabled, reportInvalidForm } from "@/cli/pre-parse"
import { renderOutput } from "@/cli/render"
import { resolveSelect, supportsSelect } from "@/cli/runner/select"
import { outputFormats } from "@/cli/spec"
import { TrackerError } from "@/domain/error"

// Canonical-form detection lives in pre-parse.ts because it needs raw flag values for the replacement hint; format.ts only classifies the command and output flags.

const Format = GlobalFlag.Setting("format")({
  flag: Flag.Literals("format", outputFormats).pipe(
    Flag.withDescription("Output format. JSON is the default when stdout is not a terminal"),
    Flag.withMetavar("json|text"),
    Flag.optional,
  ),
})

const OutputSelect = GlobalFlag.Setting("select")({
  flag: Flag.String("select").pipe(
    Flag.withDescription("Comma-separated field paths for JSON output"),
    Flag.optional,
  ),
})

const exitCodeOfCliError = (error: CliError.CliError): number =>
  error._tag === "ShowHelp" && error.errors.length === 0 ? 0 : exitCodeOf("usage")

const messageOf = (error: CliError.CliError): string =>
  error._tag === "ShowHelp"
    ? (error.errors[0]?.message ?? "Invalid command arguments.")
    : error.message

const hintOf = (error: CliError.CliError): string => {
  const path = error._tag === "ShowHelp" ? error.commandPath.join(" ") : "rata"
  return `Run \`${path} --help\` for usage.`
}

const cliTrackerError = (error: CliError.CliError) =>
  toTrackerError(
    commandError({
      code: "usage",
      message: messageOf(error),
      hint: hintOf(error),
    }),
  )

const reportRunFailure = (error: unknown, format: OutputFormat): Effect.Effect<void> =>
  reportTrackerError(toTrackerError(error), format === "json")

const reportCliError = (error: CliError.CliError, format: OutputFormat): Effect.Effect<void> =>
  Effect.gen(function* reportCliFailure() {
    if (error._tag === "ShowHelp" && error.errors.length === 0) {
      yield* Effect.sync(() => {
        process.exitCode = 0
      })
      return
    }
    yield* reportRunFailure(cliTrackerError(error), format)
  })

const resolveFormat = (
  requested: Option.Option<OutputFormat>,
  json: boolean,
  select: boolean,
  stdoutIsTerminal: boolean,
): OutputFormat => {
  if (OptionValue.isSome(requested)) {
    return requested.value
  }
  if (json || select || !stdoutIsTerminal) {
    return "json"
  }
  return "text"
}

const runSpec = <Name extends string, Config extends CliCommand.Command.Config, R>(
  spec: CommandSpec<Name, Config, R>,
  input: CliCommand.Command.Config.Infer<Config>,
) =>
  Effect.gen(function* runCommandSpec() {
    const stdio = yield* Stdio.Stdio
    const stdoutIsTerminal = yield* stdio.stdoutIsTerminal
    const json = OptionValue.getOrElse(yield* Effect.serviceOption(JsonOutput), () => false)
    const fields = OptionValue.getOrElse(yield* Effect.serviceOption(OutputFields), () =>
      OptionValue.none<string>(),
    )
    const requestedFormat = yield* Format
    const selectedFields = yield* OutputSelect
    const format = resolveFormat(
      requestedFormat,
      json,
      OptionValue.isSome(selectedFields),
      stdoutIsTerminal,
    )
    return yield* Effect.gen(function* executeSpec() {
      const activeOutput = spec.outputFor?.(input) ?? spec.output
      if (activeOutput === undefined) {
        return yield* reportRunFailure(
          new TrackerError({
            code: "internal",
            message: "The command has no output spec.",
            hint: null,
          }),
          format === "json" ? "json" : "text",
        )
      }
      const select = yield* resolveSelect(activeOutput, fields, selectedFields, format)
      const runnerInput: RunnerControlInput = spec.control?.(input) ?? {}
      const body = yield* readBodyInput(
        runnerInput.body ?? OptionValue.none(),
        runnerInput.bodyFile ?? OptionValue.none(),
      )
      const control: CommandControl = {
        format,
        select,
        dryRun: runnerInput.dryRun ?? false,
        ifUnchanged: runnerInput.ifUnchanged ?? OptionValue.none(),
        body,
      }
      const output: CommandOutput = yield* spec.run(input, control)
      const code = yield* renderOutput(output, activeOutput, { format, select })
      return yield* Effect.sync(() => {
        process.exitCode = code
      })
    }).pipe(Effect.catch((error: TrackerError) => reportRunFailure(error, format)))
  })

const buildCommand = <Name extends string, Config extends CliCommand.Command.Config, R>(
  spec: CommandSpec<Name, Config, R>,
) => {
  const command = Command.make(spec.name, spec.input, (input) => runSpec(spec, input)).pipe(
    Command.withDescription(spec.summary),
    Command.withExamples(spec.examples ?? []),
  )
  const modern = withModernOutput(command)
  const selectable = spec.selectable ?? (spec.output !== undefined && supportsSelect(spec.output))
  return selectable ? withSelectable(modern) : modern
}

const buildGroup = <
  const Name extends string,
  const Commands extends readonly CliCommand.Command.Any[],
>(
  name: Name,
  description: string,
  commands: Commands,
) =>
  Command.make(name).pipe(
    Command.withDescription(description),
    Command.withSubcommands(commands),
    withModernOutput,
  )

const isIssueWriteCommand = (args: readonly string[]): boolean =>
  args[0] === "issue" &&
  (args[1] === "apply" ||
    args[1] === "relate" ||
    args[1] === "comment" ||
    args[1] === "start" ||
    args[1] === "handoff" ||
    args[1] === "close" ||
    args[1] === "publish")

const runCli = <Name extends string, Input, ContextInput, E, R>(
  version: string,
  root: CliCommand.Command<Name, Input, ContextInput, E, R>,
) =>
  Effect.gen(function* runCommandTree() {
    const stdio = yield* Stdio.Stdio
    const args = yield* stdio.args
    const stdoutIsTerminal = yield* stdio.stdoutIsTerminal
    const format = formatFromArgs(args, stdoutIsTerminal)
    setSuppressHelp(false)
    const invalid = detectInvalidForm(args)
    if (invalid !== undefined) {
      return yield* reportInvalidForm(invalid, format === "json")
    }
    if (!helpRequested(args) && isLegacyIssueCommand(args) && hasNewOutputFlag(args)) {
      return yield* reportRunFailure(
        new TrackerError({
          code: "usage",
          message: "The --format and --select flags are not supported by this command.",
          hint: "Use --json for JSON output; --fields applies to reads.",
        }),
        jsonEnabled(args) ? "json" : "text",
      )
    }
    if (!helpRequested(args) && isIssueReadCommand(args) && hasOldOutputFlag(args)) {
      return yield* reportRunFailure(
        new TrackerError({
          code: "usage",
          message: "The --json and --fields flags are not supported by issue reads.",
          hint: "Use --format json; --select replaces --fields.",
        }),
        "json",
      )
    }
    if (!helpRequested(args) && isIssueWriteCommand(args) && hasOldOutputFlag(args)) {
      return yield* reportRunFailure(
        new TrackerError({
          code: "usage",
          message: "The --json and --fields flags are not supported by issue writes.",
          hint: "Use --format json; --select replaces --fields.",
        }),
        "json",
      )
    }
    const allowHelp = helpRequested(args) || isBareInvocation(root, args)
    setSuppressHelp(format === "json" && !allowHelp)
    const console = yield* Console.Console
    return yield* Command.runWith(root, { version, renderErrors: false })(args).pipe(
      Effect.provideService(Console.Console, dropEmptyLine(console)),
      Effect.ensuring(
        Effect.sync(() => {
          setSuppressHelp(false)
        }),
      ),
      Effect.catchIf(CliError.isCliError, (error) => reportCliError(error, format)),
      Effect.catch((error) => reportRunFailure(error, format)),
    )
  })

export {
  Format,
  OutputSelect,
  buildCommand,
  buildGroup,
  exitCodeOfCliError,
  reportCliError,
  runCli,
}
