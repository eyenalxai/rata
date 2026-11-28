import type { Option } from "effect"
import type { Command as CliCommand } from "effect/cli"

import { Effect } from "effect"

import type { FieldPath, FieldShape } from "@/cli/field/shape"
import type { TrackerError } from "@/domain/error"
import type { PageInfo } from "@/linear/decode/page"

import { toTrackerError } from "@/cli/error-report"

const outputFormats = ["json", "text"] as const
type OutputFormat = (typeof outputFormats)[number]

type CommandOutputBase = {
  readonly exitCode?: number | undefined
}

type RenderedOutput = {
  readonly stream: "stdout" | "stderr"
  readonly lines: readonly string[]
}

type CliExit = {
  readonly code: number
  readonly output: RenderedOutput | null
  readonly error: TrackerError | null
}

type CommandOutput =
  | ({
      readonly kind: "resource"
      readonly value: unknown
      readonly text: readonly string[]
    } & CommandOutputBase)
  | ({
      readonly kind: "collection"
      readonly key: string
      readonly items: readonly unknown[]
      readonly pageInfo: PageInfo
      readonly text: readonly string[]
    } & CommandOutputBase)
  | ({ readonly kind: "text"; readonly lines: readonly string[] } & CommandOutputBase)

type OutputSpec =
  | {
      readonly kind: "resource"
      readonly shape: FieldShape
      readonly select?: { readonly at: readonly string[] }
    }
  | { readonly kind: "collection"; readonly shape: FieldShape; readonly select: true }
  | { readonly kind: "text" }

type OutputSpecs = OutputSpec | readonly OutputSpec[]

type CommandControl = {
  readonly format: OutputFormat
  readonly select: Option.Option<readonly FieldPath[]>
  readonly dryRun: boolean
  readonly ifUnchanged: Option.Option<string>
  readonly body: Option.Option<string>
}

type RunnerControlInput = {
  readonly dryRun?: boolean | undefined
  readonly bodyFile?: Option.Option<string> | undefined
  readonly ifUnchanged?: Option.Option<string> | undefined
}

type CommandSpec<Name extends string, Config extends CliCommand.Command.Config, R> = {
  readonly name: Name
  readonly summary: string
  readonly examples?: readonly CliCommand.Command.Example[] | undefined
  readonly input: Config
  readonly output?: OutputSpecs | undefined
  readonly outputFor?: ((input: CliCommand.Command.Config.Infer<Config>) => OutputSpecs) | undefined
  readonly selectable?: boolean | undefined
  readonly control?:
    | ((input: CliCommand.Command.Config.Infer<Config>) => RunnerControlInput)
    | undefined
  readonly run: (
    input: CliCommand.Command.Config.Infer<Config>,
    control: CommandControl,
  ) => Effect.Effect<CommandOutput, TrackerError, R>
}

const selectOutput = (shape: FieldShape, at: readonly string[] = []): OutputSpec => ({
  kind: "resource",
  shape,
  select: { at },
})

const resourceOutput = (shape: FieldShape): OutputSpec => ({ kind: "resource", shape })

const collectionOutput = (shape: FieldShape): OutputSpec => ({
  kind: "collection",
  shape,
  select: true,
})

const textOutput: OutputSpec = { kind: "text" }

const defineCommand = <
  const Name extends string,
  const Config extends CliCommand.Command.Config,
  R,
>(
  name: Name,
  spec: {
    readonly summary: string
    readonly examples?: readonly CliCommand.Command.Example[] | undefined
    readonly input: Config
    readonly output?: OutputSpecs | undefined
    readonly outputFor?:
      | ((input: CliCommand.Command.Config.Infer<Config>) => OutputSpecs)
      | undefined
    readonly selectable?: boolean | undefined
    readonly control?:
      | ((input: CliCommand.Command.Config.Infer<Config>) => RunnerControlInput)
      | undefined
    readonly run: (
      input: CliCommand.Command.Config.Infer<Config>,
      control: CommandControl,
    ) => Effect.Effect<CommandOutput, Error, R>
  },
): CommandSpec<Name, Config, R> => {
  if ((spec.selectable === true) !== (spec.outputFor !== undefined)) {
    throw new Error("selectable and outputFor must be set together.")
  }
  return {
    name,
    summary: spec.summary,
    ...(spec.examples === undefined ? {} : { examples: spec.examples }),
    input: spec.input,
    ...(spec.output === undefined ? {} : { output: spec.output }),
    ...(spec.outputFor === undefined ? {} : { outputFor: spec.outputFor }),
    ...(spec.selectable === undefined ? {} : { selectable: spec.selectable }),
    ...(spec.control === undefined ? {} : { control: spec.control }),
    run: (input, control) => spec.run(input, control).pipe(Effect.mapError(toTrackerError)),
  }
}

export {
  type CliExit,
  type CommandControl,
  type CommandOutput,
  type CommandSpec,
  collectionOutput,
  defineCommand,
  outputFormats,
  type OutputFormat,
  type OutputSpec,
  type OutputSpecs,
  type RenderedOutput,
  resourceOutput,
  type RunnerControlInput,
  selectOutput,
  textOutput,
}
