import { Schema } from "effect"

class ConflictError extends Schema.TaggedError<ConflictError>()("ConflictError", {
  code: Schema.tag("conflict"),
  expected: Schema.String,
  current: Schema.String,
  message: Schema.String,
}) {}

export { ConflictError }
