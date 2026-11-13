import { Schema } from "effect"

class FieldSelectionError extends Schema.TaggedError<FieldSelectionError>()("FieldSelectionError", {
  message: Schema.String,
  hint: Schema.optional(Schema.String),
  path: Schema.optional(Schema.String),
  validPaths: Schema.optional(Schema.Array(Schema.String)),
}) {}

export { FieldSelectionError }
