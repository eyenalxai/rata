import { Schema } from "effect"

class AuthStoreError extends Schema.TaggedError<AuthStoreError>()("AuthStoreError", {
  message: Schema.String,
  cause: Schema.optional(Schema.Defect()),
}) {}

export { AuthStoreError }
