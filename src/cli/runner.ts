import type { Command as CliCommand } from "effect/cli"

import { Console, Effect, Option as OptionValue, Ref, Stdio } from "effect"
import { CliError, Command, Flag, GlobalFlag } from "effect/cli"

import type {
  CliExit,
  CommandControl,
  CommandOutput,
  CommandSpec,
  OutputFormat,
  RunnerControlInput,
} from "@/cli/spec"

import { dropEmptyLine } from "@/cli/console"
import { commandError, exitCodeOf, toTrackerError } from "@/cli/error-report"
import { ExitRef, recordExit, successExit } from "@/cli/exit"
import { OutputFields } from "@/cli/fields"
import {
  formatFromArgs,
  hasOldOutputFlag,
  helpRequested,
  isBareInvocation,
  isIssueReadCommand,
  isIssueWriteCommand,
  resolveFormat,
} from "@/cli/format"
import { setSuppressHelp, withModernOutput, withSelectable } from "@/cli/help"
import { readBodyInput } from "@/cli/input"
import { JsonOutput, reportTrackerError } from "@/cli/output"
import { detectInvalidForm, reportInvalidForm } from "@/cli/pre-parse"
import { renderOutput } from "@/cli/render"
import { resolveSelect, supportsSelect } from "@/cli/runner/select"
import { outputFormats } from "@/cli/spec"
import { CommandMetadata } from "@/cli/surface"
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

const reportRunFailure = (error: unknown, format: OutputFormat): Effect.Effect<CliExit> =>
  reportTrackerError(toTrackerError(error), format === "json")

const reportCliError = (error: CliError.CliError, format: OutputFormat): Effect.Effect<CliExit> =>
  exitCodeOfCliError(error) === 0
    ? Effect.succeed(successExit)
    : reportRunFailure(cliTrackerError(error), format)

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
    const format = resolveFormat({
      requested: OptionValue.getOrUndefined(requestedFormat),
      json,
      select: OptionValue.isSome(selectedFields),
      stdoutIsTerminal,
    })
    return yield* Effect.gen(function* executeSpec() {
      const activeOutput = spec.outputFor?.(input) ?? spec.output
      if (activeOutput === undefined) {
        return yield* reportRunFailure(
          new TrackerError({
            code: "internal",
            message: "The command has no output spec.",
            hint: null,
          }),
          format,
        )
      }
      const select = yield* resolveSelect(activeOutput, fields, selectedFields, format)
      const runnerInput: RunnerControlInput = spec.control?.(input) ?? {}
      const body = yield* readBodyInput(runnerInput.bodyFile ?? OptionValue.none())
      const control: CommandControl = {
        format,
        select,
        dryRun: runnerInput.dryRun ?? false,
        ifUnchanged: runnerInput.ifUnchanged ?? OptionValue.none(),
        body,
      }
      const output: CommandOutput = yield* spec.run(input, control)
      return yield* renderOutput(output, activeOutput, { format, select })
    }).pipe(
      Effect.catch((error: TrackerError) => reportRunFailure(error, format)),
      Effect.flatMap(recordExit),
    )
  })

const buildCommand = <Name extends string, Config extends CliCommand.Command.Config, R>(
  spec: CommandSpec<Name, Config, R>,
) => {
  const command = Command.make(spec.name, spec.input, (input) => runSpec(spec, input)).pipe(
    Command.withDescription(spec.summary),
    Command.withExamples(spec.examples ?? []),
    Command.annotate(CommandMetadata, { input: spec.input }),
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
    const ref = yield* Ref.make<CliExit | null>(null)
    yield* Command.runWith(root, { version, renderErrors: false })(args).pipe(
      Effect.ensuring(
        Effect.sync(() => {
          setSuppressHelp(false)
        }),
      ),
      Effect.catchIf(CliError.isCliError, (error) =>
        reportCliError(error, format).pipe(Effect.flatMap(recordExit), Effect.asVoid),
      ),
      Effect.catch((error) =>
        reportRunFailure(error, format).pipe(Effect.flatMap(recordExit), Effect.asVoid),
      ),
      Effect.provideService(ExitRef, ref),
      Effect.provideService(Console.Console, dropEmptyLine(console)),
    )
    const recorded = yield* Ref.get(ref)
    return recorded ?? successExit
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
