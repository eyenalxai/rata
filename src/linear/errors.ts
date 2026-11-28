import { Schema } from "effect"

import type { ErrorCode } from "@/domain/error"

import { ErrorCodeSchema } from "@/domain/error"

class LinearAuthError extends Schema.TaggedError<LinearAuthError>()("LinearAuthError", {
  code: ErrorCodeSchema,
  message: Schema.String,
  status: Schema.optional(Schema.Finite),
  cause: Schema.optional(Schema.Defect()),
}) {}

class LinearGraphQLError extends Schema.TaggedError<LinearGraphQLError>()("LinearGraphQLError", {
  code: ErrorCodeSchema,
  message: Schema.String,
  details: Schema.Array(Schema.String),
  cause: Schema.optional(Schema.Defect()),
}) {}

class LinearRateLimitError extends Schema.TaggedError<LinearRateLimitError>()(
  "LinearRateLimitError",
  {
    code: Schema.tag("rate_limited"),
    message: Schema.String,
    retryAfterSeconds: Schema.optional(Schema.Finite),
    cause: Schema.optional(Schema.Defect()),
  },
) {}

class LinearNetworkError extends Schema.TaggedError<LinearNetworkError>()("LinearNetworkError", {
  code: Schema.tag("network"),
  message: Schema.String,
  cause: Schema.optional(Schema.Defect()),
}) {}

class LinearInternalError extends Schema.TaggedError<LinearInternalError>()("LinearInternalError", {
  code: Schema.tag("internal"),
  message: Schema.String,
  cause: Schema.optional(Schema.Defect()),
}) {}

type LinearApiError =
  | LinearAuthError
  | LinearGraphQLError
  | LinearInternalError
  | LinearNetworkError
  | LinearRateLimitError

const isRetryableLinearError = (error: LinearApiError): boolean =>
  error._tag === "LinearRateLimitError" || error._tag === "LinearNetworkError"

const graphQLErrorCode = (messages: readonly string[]): ErrorCode => {
  const text = messages.join(" ").toLowerCase()
  if (text.includes("duplicate") || text.includes("already exists")) {
    return "conflict"
  }
  if (text.includes("not found")) {
    return "not_found"
  }
  return "internal"
}

export {
  graphQLErrorCode,
  isRetryableLinearError,
  LinearAuthError,
  LinearGraphQLError,
  LinearInternalError,
  LinearNetworkError,
  LinearRateLimitError,
  type LinearApiError,
}
