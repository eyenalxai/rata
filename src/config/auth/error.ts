import { Schema } from "effect"

class AuthStoreError extends Schema.TaggedError<AuthStoreError>()("AuthStoreError", {
  code: Schema.tag("auth"),
  message: Schema.String,
  cause: Schema.optional(Schema.Defect()),
}) {}

export { AuthStoreError }
