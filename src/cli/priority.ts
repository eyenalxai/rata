import { Effect, Option, Result, Schema } from "effect"

import type { Priority } from "@/domain/priority"

import { parsePriority } from "@/domain/priority"

class PriorityInputError extends Schema.TaggedError<PriorityInputError>()("PriorityInputError", {
  code: Schema.tag("validation"),
  message: Schema.String,
}) {}

const resolvePriority = Effect.fn("Cli.Priority.resolvePriority")(function* resolvePriority(
  value: Option.Option<string>,
) {
  if (Option.isNone(value)) {
    return Option.none<Priority>()
  }
  const parsed = parsePriority(value.value)
  if (Result.isFailure(parsed)) {
    return yield* new PriorityInputError({ message: parsed.failure })
  }
  return Option.some(parsed.success)
})

export { PriorityInputError, resolvePriority }
