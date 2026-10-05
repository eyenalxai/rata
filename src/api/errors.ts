import { Schema } from "effect"

class LinearAuthError extends Schema.TaggedError<LinearAuthError>()("LinearAuthError", {
  message: Schema.String,
  status: Schema.optional(Schema.Finite),
}) {}

class LinearGraphQLError extends Schema.TaggedError<LinearGraphQLError>()("LinearGraphQLError", {
  message: Schema.String,
  details: Schema.Array(Schema.String),
}) {}

class LinearRateLimitError extends Schema.TaggedError<LinearRateLimitError>()(
  "LinearRateLimitError",
  {
    message: Schema.String,
    retryAfterSeconds: Schema.optional(Schema.Finite),
  },
) {}

class LinearNetworkError extends Schema.TaggedError<LinearNetworkError>()("LinearNetworkError", {
  message: Schema.String,
}) {}

type LinearApiError =
  | LinearAuthError
  | LinearGraphQLError
  | LinearNetworkError
  | LinearRateLimitError

const isRetryableLinearError = (error: LinearApiError): boolean =>
  error._tag === "LinearRateLimitError" || error._tag === "LinearNetworkError"

export {
  isRetryableLinearError,
  LinearAuthError,
  LinearGraphQLError,
  LinearNetworkError,
  LinearRateLimitError,
  type LinearApiError,
}
