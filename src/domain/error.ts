import { Schema } from "effect"

const errorCodes = [
  "usage",
  "validation",
  "not_linked",
  "not_found",
  "ambiguous",
  "auth",
  "forbidden",
  "conflict",
  "rate_limited",
  "network",
  "internal",
] as const
type ErrorCode = (typeof errorCodes)[number]

const ErrorCodeSchema = Schema.Literals(errorCodes)

const CodedError = Schema.Struct({
  _tag: Schema.String,
  code: ErrorCodeSchema,
  message: Schema.String,
})
type CodedError = typeof CodedError.Type

class TrackerError extends Schema.TaggedError<TrackerError>()("TrackerError", {
  code: ErrorCodeSchema,
  message: Schema.String,
  hint: Schema.NullOr(Schema.String),
  retryAfterSeconds: Schema.optional(Schema.Finite),
  details: Schema.optional(Schema.Record(Schema.String, Schema.Unknown)),
  cause: Schema.optional(Schema.Defect()),
}) {}

export { CodedError, type ErrorCode, ErrorCodeSchema, TrackerError }
