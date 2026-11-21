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

class TrackerError extends Schema.TaggedError<TrackerError>()("TrackerError", {
  code: Schema.Literals(errorCodes),
  message: Schema.String,
  hint: Schema.NullOr(Schema.String),
  details: Schema.optional(Schema.Record(Schema.String, Schema.Unknown)),
  cause: Schema.optional(Schema.Defect()),
}) {}

export { type ErrorCode, errorCodes, TrackerError }
