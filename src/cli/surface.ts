import type { Command as CliCommand } from "effect/cli"

import { Context, Option, Predicate } from "effect"
import { Param, Primitive } from "effect/cli"

type SurfaceParam = {
  readonly name: string
  readonly kind: "argument" | "flag"
  readonly type: string
  readonly description: string | null
  readonly required: boolean
  readonly variadic: boolean
  readonly aliases: readonly string[]
  readonly choices: readonly string[]
}

type SurfaceNode = {
  readonly kind: "command" | "group"
  readonly name: string
  readonly path: readonly string[]
  readonly summary: string
  readonly params: readonly SurfaceParam[]
  readonly examples: readonly CliCommand.Command.Example[]
  readonly children: readonly SurfaceNode[]
}

type Surface = {
  readonly roots: readonly SurfaceNode[]
  readonly globalParams: readonly SurfaceParam[]
}

type CommandMetadata = {
  readonly summary: string
  readonly examples: readonly CliCommand.Command.Example[]
  readonly input: CliCommand.Command.Config
}

const CommandMetadata = Context.Reference<CommandMetadata | null>(
  "rata-cli/cli/surface/CommandMetadata",
  { defaultValue: () => null },
)

const collectParams = (config: CliCommand.Command.Config): readonly Param.Any[] => {
  const params: Param.Any[] = []
  const visit = (value: unknown): void => {
    if (Param.isParam(value)) {
      params.push(value)
      return
    }
    if (Array.isArray(value)) {
      for (const item of value) {
        visit(item)
      }
      return
    }
    if (Predicate.isObject(value)) {
      for (const item of Object.values(value)) {
        visit(item)
      }
    }
  }
  visit(config)
  return params
}

type ParamShape = {
  readonly kind: "argument" | "flag"
  readonly optional: boolean
  readonly variadic: boolean
  readonly singles: readonly Param.Single<Param.ParamKind, unknown>[]
}

const shapeOf = (param: Param.Any): ParamShape => {
  if (Param.isSingle(param)) {
    return { kind: param.kind, optional: false, variadic: false, singles: [param] }
  }
  if (Predicate.hasProperty("param")(param) && Param.isParam(param.param)) {
    const shape = shapeOf(param.param)
    const min = Predicate.hasProperty("min")(param) ? param.min : undefined
    const allowsZero = Option.isOption(min) && Option.isSome(min) && min.value === 0
    return {
      ...shape,
      optional: shape.optional || param._tag === "Optional" || allowsZero,
      variadic: shape.variadic || param._tag === "Variadic",
    }
  }
  return { kind: param.kind, optional: false, variadic: false, singles: [] }
}

const choiceKeysOf = (primitive: Primitive.Primitive<unknown>): readonly string[] => {
  if (!Predicate.hasProperty("choiceKeys")(primitive) || !Array.isArray(primitive.choiceKeys)) {
    return []
  }
  return primitive.choiceKeys.filter((key): key is string => typeof key === "string")
}

const paramDocsOf = (params: readonly Param.Any[]): readonly SurfaceParam[] =>
  params.flatMap((param) => {
    const shape = shapeOf(param)
    return shape.singles
      .filter((single) => !single.hidden)
      .map((single) => ({
        name: single.name,
        kind: shape.kind,
        type: single.typeName ?? Primitive.getTypeName(single.primitiveType),
        description: Option.getOrNull(single.description),
        required: !shape.optional,
        variadic: shape.variadic,
        aliases: single.aliases,
        choices: choiceKeysOf(single.primitiveType),
      }))
  })

const paramDocs = (config: CliCommand.Command.Config): readonly SurfaceParam[] =>
  paramDocsOf(collectParams(config))

const nodeOf = (command: CliCommand.Command.Any, parent: readonly string[]): SurfaceNode => {
  const path = [...parent, command.name]
  const metadata = Option.getOrNull(Context.getOption(command.annotations, CommandMetadata))
  const children = command.subcommands
    .flatMap((group) => group.commands)
    .filter((child) => !child.unlisted)
    .map((child) => nodeOf(child, path))
  return {
    kind: metadata === null ? "group" : "command",
    name: command.name,
    path,
    summary: command.description ?? metadata?.summary ?? "",
    params: metadata === null ? [] : paramDocs(metadata.input),
    examples: command.examples,
    children,
  }
}

const surfaceOf = (
  commands: readonly CliCommand.Command.Any[],
  globalParams: readonly Param.Any[] = [],
): Surface => ({
  roots: commands.filter((command) => !command.unlisted).map((command) => nodeOf(command, [])),
  globalParams: paramDocsOf(globalParams),
})

export { CommandMetadata, type Surface, type SurfaceNode, type SurfaceParam, surfaceOf }
