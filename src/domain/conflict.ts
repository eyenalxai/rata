import { Schema } from "effect"

class ConflictError extends Schema.TaggedError<ConflictError>()("ConflictError", {
  expected: Schema.String,
  current: Schema.String,
  message: Schema.String,
}) {}

export { ConflictError }
