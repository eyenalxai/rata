import { Effect, Option, Result } from "effect"
import { Flag, GlobalFlag } from "effect/cli"

import type { FieldPath, FieldShape } from "@/cli/field/shape"

import { FieldSelectionError } from "@/cli/field/error"
import { selectFields, selectValues } from "@/cli/field/select"

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
      hint: "--fields applies to reads only. Use --json and jq on the write result.",
    })
  }
  return yield* Effect.void
})

const selectObject = Effect.fn("Cli.Fields.object")(function* selectObject(
  fields: Option.Option<readonly FieldPath[]>,
  shape: FieldShape,
  value: unknown,
) {
  if (Option.isNone(fields)) {
    return value
  }
  const selected = selectFields(shape, value, fields.value)
  if (Result.isFailure(selected)) {
    return yield* selected.failure
  }
  return selected.success
})

const selectItems = Effect.fn("Cli.Fields.items")(function* selectItems(
  fields: Option.Option<readonly FieldPath[]>,
  shape: FieldShape,
  values: readonly unknown[],
) {
  if (Option.isNone(fields)) {
    return values
  }
  const selected = selectValues(shape, values, fields.value)
  if (Result.isFailure(selected)) {
    return yield* selected.failure
  }
  return selected.success
})

export { OutputFields, parseFieldPaths, readFields, rejectFields, selectItems, selectObject }
