import type { Effect, Option } from "effect"
import type { Command as CliCommand } from "effect/cli"

import type { FieldPath, FieldShape } from "@/cli/field/shape"
import type { PlanStep } from "@/domain/plan"
import type { PageInfo } from "@/linear/decode/page"
import type { BulkWriteResult } from "@/tracker/write/model"

const outputFormats = ["json", "text"] as const
type OutputFormat = (typeof outputFormats)[number]

type CommandOutput =
  | {
      readonly kind: "resource"
      readonly value: unknown
      readonly text: readonly string[]
    }
  | {
      readonly kind: "collection"
      readonly key: string
      readonly items: readonly unknown[]
      readonly pageInfo: PageInfo
      readonly text: readonly string[]
    }
  | { readonly kind: "text"; readonly lines: readonly string[] }
  | {
      readonly kind: "plan"
      readonly steps: readonly PlanStep[]
      readonly text: readonly string[]
    }
  | {
      readonly kind: "bulk"
      readonly dryRun: boolean
      readonly results: readonly BulkWriteResult[]
      readonly text: readonly string[]
    }
  | { readonly kind: "none" }

type OutputSpec =
  | {
      readonly kind: "resource"
      readonly shape: FieldShape
      readonly select?: { readonly at: readonly string[] }
    }
  | { readonly kind: "collection"; readonly shape: FieldShape; readonly select: true }
  | { readonly kind: "text" }
  | { readonly kind: "plan" }
  | { readonly kind: "bulk" }
  | { readonly kind: "none" }

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
  readonly output: OutputSpec
  readonly control?:
    | ((input: CliCommand.Command.Config.Infer<Config>) => RunnerControlInput)
    | undefined
  readonly run: (
    input: CliCommand.Command.Config.Infer<Config>,
    control: CommandControl,
  ) => Effect.Effect<CommandOutput, Error, R>
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
const planOutput: OutputSpec = { kind: "plan" }
const bulkOutput: OutputSpec = { kind: "bulk" }
const noneOutput: OutputSpec = { kind: "none" }

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
    readonly output: OutputSpec
    readonly control?:
      | ((input: CliCommand.Command.Config.Infer<Config>) => RunnerControlInput)
      | undefined
    readonly run: (
      input: CliCommand.Command.Config.Infer<Config>,
      control: CommandControl,
    ) => Effect.Effect<CommandOutput, Error, R>
  },
): CommandSpec<Name, Config, R> => ({ name, ...spec })

export {
  bulkOutput,
  type CommandControl,
  type CommandOutput,
  type CommandSpec,
  collectionOutput,
  defineCommand,
  noneOutput,
  outputFormats,
  type OutputFormat,
  type OutputSpec,
  planOutput,
  resourceOutput,
  type RunnerControlInput,
  selectOutput,
  textOutput,
}
