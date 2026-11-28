import { Predicate, Schema } from "effect"

import type { ErrorCode } from "@/domain/error"

import { ErrorCodeSchema, TrackerError } from "@/domain/error"

type ErrorRule = {
  readonly code: ErrorCode
  readonly hint: string | null
}

class CommandError extends Schema.TaggedError<CommandError>()("CommandError", {
  code: ErrorCodeSchema,
  message: Schema.String,
  hint: Schema.NullOr(Schema.String),
  retryAfterSeconds: Schema.optional(Schema.Finite),
  details: Schema.optional(Schema.Record(Schema.String, Schema.Unknown)),
  cause: Schema.optional(Schema.Defect()),
}) {}

type CommandErrorInput = {
  readonly code: ErrorCode
  readonly message: string
  readonly hint: string | null
  readonly retryAfterSeconds?: number | undefined
  readonly details?: Readonly<Record<string, unknown>> | undefined
  readonly cause?: unknown
}

const commandError = (input: CommandErrorInput): CommandError => new CommandError(input)

const fieldOf = (error: unknown, key: string): unknown =>
  Predicate.isObject(error) ? Reflect.get(error, key) : undefined

const tagOf = (error: unknown): string | undefined => {
  const tag = fieldOf(error, "_tag")
  return Predicate.isString(tag) ? tag : undefined
}

const messageOf = (error: unknown): string => {
  const message = fieldOf(error, "message")
  return Predicate.isString(message) ? message : "Unexpected error."
}

const errorRules: Record<string, ErrorRule> = {
  LinearAuthError: { code: "auth", hint: "Run `rata admin auth login --with-token`." },
  LinearNetworkError: { code: "network", hint: "Check the connection and retry." },
  TeamResolutionError: { code: "not_linked", hint: null },
  TeamNotFoundError: {
    code: "not_found",
    hint: "A team key and an issue identifier prefix can differ after a rename. Run `rata admin team list` to see the team keys, then run `rata admin link --team <key>` to repair the link.",
  },
  ContextLabelNotFoundError: { code: "not_found", hint: null },
  LabelNotFoundError: { code: "not_found", hint: null },
  LabelCreateError: {
    code: "conflict",
    hint: "Check the label name, or pass `--if-not-exists`.",
  },
  LabelUpdateError: {
    code: "conflict",
    hint: "Check the label name, or pass `--if-not-exists`.",
  },
  ProjectNotFoundError: { code: "not_found", hint: null },
  ProjectNameAmbiguousError: { code: "ambiguous", hint: null },
  IssueRefNotFoundError: { code: "not_found", hint: "Check the reference and retry." },
  AssigneeInputError: {
    code: "validation",
    hint: "Use `me` or a user UUID. Run `rata admin team show --format json` to see the members.",
  },
  AssigneeNotFoundError: {
    code: "not_found",
    hint: "Run `rata admin team show --format json` to see the members.",
  },
  ProjectAlreadyDeletedError: { code: "conflict", hint: null },
  ProjectNotDeletedError: { code: "conflict", hint: null },
  ContextStateNotFoundError: { code: "not_found", hint: null },
  SectionAmbiguousError: {
    code: "ambiguous",
    hint: "Rename one heading, or quote a heading that appears once.",
  },
  InvalidIssueRef: { code: "validation", hint: null },
  InputError: { code: "validation", hint: null },
  TriageMapError: { code: "validation", hint: null },
  BodyInputError: { code: "validation", hint: null },
  ColorInputError: { code: "validation", hint: null },
  PriorityInputError: { code: "validation", hint: null },
  LinkError: { code: "validation", hint: null },
  AuthStoreError: { code: "auth", hint: "Run `rata admin auth login --with-token`." },
  DatabaseError: { code: "internal", hint: "Run with RATA_DEBUG=1 for details." },
  LinearInternalError: { code: "internal", hint: "Run with RATA_DEBUG=1 for details." },
  PromptRequiredError: { code: "validation", hint: "Pass --yes to skip the prompt." },
}

const exitCodes: Record<ErrorCode, number> = {
  usage: 2,
  validation: 2,
  not_linked: 2,
  ambiguous: 2,
  not_found: 3,
  conflict: 4,
  auth: 5,
  forbidden: 5,
  rate_limited: 6,
  network: 6,
  internal: 1,
}

const exitCodeOf = (code: ErrorCode): number => exitCodes[code]

const stringField = (error: unknown, key: string): string | null => {
  const value = fieldOf(error, key)
  return Predicate.isString(value) ? value : null
}

const stringArrayField = (error: unknown, key: string): readonly string[] | null => {
  const value = fieldOf(error, key)
  return Array.isArray(value) && value.every((item) => Predicate.isString(item)) ? value : null
}

const numberArrayField = (error: unknown, key: string): readonly number[] | null => {
  const value = fieldOf(error, key)
  return Array.isArray(value) && value.every((item) => Predicate.isNumber(item)) ? value : null
}

const availableHeadingsHint = (error: unknown): string => {
  const headings = stringArrayField(error, "available") ?? []
  return headings.length === 0
    ? "The issue body has no headings."
    : `Available headings: ${headings.map((heading) => `"${heading}"`).join(", ")}.`
}

const filterSubjects = {
  state: { subject: "states", command: "rata admin team show --format json" },
  label: { subject: "labels", command: "rata admin label list" },
  project: { subject: "projects", command: "rata admin project list" },
} as const

type FilterName = keyof typeof filterSubjects

const isFilterName = (value: unknown): value is FilterName =>
  Predicate.isString(value) && Object.hasOwn(filterSubjects, value)

const filterNameHint = (error: unknown): string => {
  const valid = stringArrayField(error, "valid") ?? []
  const filter = fieldOf(error, "filter")
  const subject = isFilterName(filter) ? filterSubjects[filter] : undefined
  const label = subject?.subject ?? "values"
  const command = subject?.command ?? "rata admin team show --format json"
  return valid.length === 0
    ? `Run \`${command}\` to see the ${label}.`
    : `Valid ${label}: ${valid.join(", ")}.`
}

const report = (
  error: unknown,
  code: ErrorCode,
  hint: string | null,
  details?: Readonly<Record<string, unknown>>,
): TrackerError => {
  const retryAfter = fieldOf(error, "retryAfterSeconds")
  const base = {
    code,
    message: messageOf(error),
    hint,
    ...(typeof retryAfter === "number" ? { retryAfterSeconds: retryAfter } : {}),
    ...(details === undefined ? {} : { details }),
  }
  return error === undefined ? new TrackerError(base) : new TrackerError({ ...base, cause: error })
}

const sectionBatchReport = (error: unknown): TrackerError => {
  const reason = fieldOf(error, "reason")
  const code =
    reason === "missing"
      ? "not_found"
      : reason === "duplicate" || reason === "overlap"
        ? "ambiguous"
        : "validation"
  const hint =
    reason === "overlap"
      ? "Edit only one of the overlapping sections."
      : availableHeadingsHint(error)
  const lines = numberArrayField(error, "lines") ?? []
  return report(error, code, hint, lines.length === 0 ? undefined : { lines })
}

const classifyTagged = (error: unknown): TrackerError | undefined => {
  const tag = tagOf(error)
  if (tag === "SectionNotFoundError") {
    return report(error, "not_found", availableHeadingsHint(error))
  }
  if (tag === "SectionBatchError") {
    return sectionBatchReport(error)
  }
  if (tag === "FieldSelectionError") {
    const path = stringField(error, "path")
    const validPaths = stringArrayField(error, "validPaths")
    const details = path === null || validPaths === null ? undefined : { path, validPaths }
    return report(error, "validation", stringField(error, "hint"), details)
  }
  if (tag === "ConflictError") {
    const current = stringField(error, "current")
    return report(
      error,
      "conflict",
      current === null ? null : `The current updatedAt is ${current}. Re-read the issue and retry.`,
    )
  }
  if (tag === "FilterNameNotFoundError") {
    return report(error, "not_found", filterNameHint(error))
  }
  if (tag === "LabelExistsError") {
    const existing = stringField(error, "existingName") ?? messageOf(error)
    return report(
      error,
      "conflict",
      `Labels resolve case-insensitively; use \`${existing}\`, or pass \`--if-not-exists\`.`,
    )
  }
  if (tag === "LinearAuthError" && fieldOf(error, "status") === 403) {
    return report(error, "forbidden", "Ask a workspace admin for access.")
  }
  const rule = tag === undefined ? undefined : errorRules[tag]
  return rule === undefined ? undefined : report(error, rule.code, rule.hint)
}

const classifyUnclassified = (error: unknown): TrackerError => {
  const tag = tagOf(error)
  const message = messageOf(error)
  if (tag === "LinearRateLimitError") {
    return report(error, "rate_limited", "Retry later.")
  }
  if (tag === "LinearGraphQLError") {
    const text = message.toLowerCase()
    if (text.includes("duplicate") || text.includes("already exists")) {
      return report(error, "conflict", "Use the existing object, or pass `--if-not-exists`.")
    }
    if (text.includes("not found")) {
      return report(error, "not_found", "Check the reference and retry.")
    }
  }
  return report(error, "internal", "Run with RATA_DEBUG=1 for details.")
}

const toTrackerError = (error: unknown): TrackerError => {
  if (Schema.is(TrackerError)(error)) {
    return error
  }
  if (Schema.is(CommandError)(error)) {
    return new TrackerError({
      code: error.code,
      message: error.message,
      hint: error.hint,
      ...(error.retryAfterSeconds === undefined
        ? {}
        : { retryAfterSeconds: error.retryAfterSeconds }),
      ...(error.details === undefined ? {} : { details: error.details }),
      ...(error.cause === undefined ? {} : { cause: error.cause }),
    })
  }
  const tagged = classifyTagged(error)
  if (tagged !== undefined) {
    return tagged
  }
  return classifyUnclassified(error)
}

export { commandError, exitCodeOf, toTrackerError }
