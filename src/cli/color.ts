import { Effect, Option, Result, Schema } from "effect"

import { parseLabelColor } from "@/domain/labels"

class ColorInputError extends Schema.TaggedError<ColorInputError>()("ColorInputError", {
  message: Schema.String,
}) {}

const resolveColor = Effect.fn("Cli.Color.resolveColor")(function* resolveColor(
  value: Option.Option<string>,
) {
  if (Option.isNone(value)) {
    return Option.none<string>()
  }
  const parsed = parseLabelColor(value.value)
  if (Result.isFailure(parsed)) {
    return yield* new ColorInputError({ message: parsed.failure })
  }
  return Option.some(parsed.success)
})

export { ColorInputError, resolveColor }
