import { Effect, Option, Result, Schema } from "effect"

import { parsePriority } from "@/domain/priority"

class PriorityInputError extends Schema.TaggedError<PriorityInputError>()("PriorityInputError", {
  message: Schema.String,
}) {}

const resolvePriority = Effect.fn("Cli.Priority.resolvePriority")(function* resolvePriority(
  value: Option.Option<string>,
) {
  if (Option.isNone(value)) {
    return Option.none<number>()
  }
  const parsed = parsePriority(value.value)
  if (Result.isFailure(parsed)) {
    return yield* new PriorityInputError({ message: parsed.failure })
  }
  return Option.some(parsed.success)
})

export { PriorityInputError, resolvePriority }
