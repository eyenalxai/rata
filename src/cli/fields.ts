import { Effect, Option, Result, Schema } from "effect"
import { Flag, GlobalFlag } from "effect/cli"

class FieldSelectionError extends Schema.TaggedError<FieldSelectionError>()("FieldSelectionError", {
  message: Schema.String,
  hint: Schema.optional(Schema.String),
}) {}

type FieldPath = readonly string[]

const OutputFields = GlobalFlag.Setting("fields")({
  flag: Flag.String("fields").pipe(
    Flag.withDescription("Comma-separated field paths for --json output"),
    Flag.optional,
  ),
})

const parseFieldPaths = (
  value: string,
): Result.Result<readonly FieldPath[], FieldSelectionError> => {
  const paths = value
    .split(",")
    .map((part) => part.trim())
    .filter((part) => part.length > 0)
    .map((part) => part.split("."))
  if (paths.length === 0) {
    return Result.fail(new FieldSelectionError({ message: "--fields needs at least one path." }))
  }
  if (paths.some((path) => path.some((segment) => segment.length === 0))) {
    return Result.fail(
      new FieldSelectionError({ message: "Each --fields path needs a name between the dots." }),
    )
  }
  return Result.succeed(paths)
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value)

const validPathHint = (value: unknown): string | undefined => {
  if (!isRecord(value)) {
    return undefined
  }
  const keys = Object.keys(value).toSorted()
  return keys.length === 0 ? undefined : `Valid paths: ${keys.join(", ")}.`
}

const unknownPath = (value: unknown, path: FieldPath): FieldSelectionError => {
  const hint = validPathHint(value)
  return new FieldSelectionError({
    message: `Unknown field path: ${path.join(".")}.`,
    ...(hint === undefined ? {} : { hint }),
  })
}

const selectFields = (
  value: unknown,
  paths: readonly FieldPath[],
): Result.Result<unknown, FieldSelectionError> => {
  if (!isRecord(value)) {
    return Result.fail(
      new FieldSelectionError({ message: "The selected output is not an object." }),
    )
  }
  const selected: Record<string, unknown> = {}
  for (const path of paths) {
    let source: unknown = value
    let target: Record<string, unknown> = selected
    for (let index = 0; index < path.length; index += 1) {
      const key = path[index]
      if (key === undefined || !isRecord(source) || !(key in source)) {
        return Result.fail(unknownPath(value, path))
      }
      const next = source[key]
      if (index === path.length - 1) {
        target[key] = next
      } else {
        if (!isRecord(next)) {
          return Result.fail(unknownPath(value, path))
        }
        const existing = target[key]
        if (isRecord(existing)) {
          target = existing
        } else {
          const child: Record<string, unknown> = {}
          target[key] = child
          target = child
        }
      }
      source = next
    }
  }
  return Result.succeed(selected)
}

const readFields = Effect.fn("Cli.Fields.read")(function* readFields(
  json: boolean,
  fields: Option.Option<string>,
) {
  if (Option.isNone(fields)) {
    return Option.none<readonly FieldPath[]>()
  }
  if (!json) {
    return yield* new FieldSelectionError({ message: "--fields requires --json." })
  }
  const parsed = parseFieldPaths(fields.value)
  if (Result.isFailure(parsed)) {
    return yield* parsed.failure
  }
  return Option.some(parsed.success)
})

const rejectFields = Effect.fn("Cli.Fields.reject")(function* rejectFields(
  fields: Option.Option<string>,
) {
  if (Option.isSome(fields)) {
    return yield* new FieldSelectionError({
      message: "--fields is not supported by this command.",
    })
  }
  return yield* Effect.void
})

const selectObject = Effect.fn("Cli.Fields.object")(function* selectObject(
  fields: Option.Option<readonly FieldPath[]>,
  value: unknown,
) {
  if (Option.isNone(fields)) {
    return value
  }
  const selected = selectFields(value, fields.value)
  if (Result.isFailure(selected)) {
    return yield* selected.failure
  }
  return selected.success
})

const selectItems = Effect.fn("Cli.Fields.items")(function* selectItems(
  fields: Option.Option<readonly FieldPath[]>,
  values: readonly unknown[],
) {
  if (Option.isNone(fields)) {
    return values
  }
  const selected: unknown[] = []
  for (const value of values) {
    const item = selectFields(value, fields.value)
    if (Result.isFailure(item)) {
      return yield* item.failure
    }
    selected.push(item.success)
  }
  return selected
})

export {
  FieldSelectionError,
  type FieldPath,
  OutputFields,
  parseFieldPaths,
  readFields,
  rejectFields,
  selectFields,
  selectItems,
  selectObject,
}
