import { Predicate, Schema } from "effect"

import type { CodedError, ErrorCode } from "@/domain/error"

import { CodedError as CodedErrorSchema, TrackerError } from "@/domain/error"

const debugHint = "Run with RATA_DEBUG=1 for details."
const authHint = "Run `rata admin auth login --with-token`."

const fieldOf = (error: unknown, key: string): unknown =>
  Predicate.isObject(error) ? Reflect.get(error, key) : undefined

const messageOf = (error: unknown): string => {
  const message = fieldOf(error, "message")
  return Predicate.isString(message) ? message : "Unexpected error."
}

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

const tagHints: Readonly<Record<string, string>> = {
  AssigneeInputError:
    "Use `me` or a user UUID. Run `rata admin team show --format json` to see the members.",
  AssigneeNotFoundError: "Run `rata admin team show --format json` to see the members.",
  AuthStoreError: authHint,
  ContextCacheError: debugHint,
  DatabaseError: debugHint,
  IssueRefNotFoundError: "Check the reference and retry.",
  IssueWriteError: debugHint,
  LabelCreateError: "Check the label name, or pass `--if-not-exists`.",
  LabelUpdateError: "Check the label name, or pass `--if-not-exists`.",
  LinearInternalError: debugHint,
  LinearNetworkError: "Check the connection and retry.",
  LinearRateLimitError: "Retry later.",
  PromptRequiredError: "Pass --yes to skip the prompt.",
  RepoConfigError: debugHint,
  SectionAmbiguousError: "Rename one heading, or quote a heading that appears once.",
  TeamNotFoundError:
    "A team key and an issue identifier prefix can differ after a rename. Run `rata admin team list` to see the team keys, then run `rata admin link --team <key>` to repair the link.",
}

const hintOfTag = (tag: string): string | null =>
  Object.hasOwn(tagHints, tag) ? (tagHints[tag] ?? null) : null

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

const conflictHint = (error: unknown): string | null => {
  const current = stringField(error, "current")
  return current === null
    ? null
    : `The current updatedAt is ${current}. Re-read the issue and retry.`
}

const sectionBatchHint = (error: unknown): string =>
  fieldOf(error, "reason") === "overlap"
    ? "Edit only one of the overlapping sections."
    : availableHeadingsHint(error)

const labelExistsHint = (error: unknown): string => {
  const existing = stringField(error, "existingName") ?? messageOf(error)
  return `Labels resolve case-insensitively; use \`${existing}\`, or pass \`--if-not-exists\`.`
}

const linearAuthHint = (error: CodedError): string =>
  error.code === "forbidden" ? "Ask a workspace admin for access." : authHint

const linearGraphQLHint = (error: CodedError): string =>
  error.code === "conflict"
    ? "Use the existing object, or pass `--if-not-exists`."
    : error.code === "not_found"
      ? "Check the reference and retry."
      : debugHint

const hintOf = (error: CodedError): string | null => {
  switch (error._tag) {
    case "ConflictError": {
      return conflictHint(error)
    }
    case "FieldSelectionError": {
      return stringField(error, "hint")
    }
    case "FilterNameNotFoundError": {
      return filterNameHint(error)
    }
    case "LabelExistsError": {
      return labelExistsHint(error)
    }
    case "LinearAuthError": {
      return linearAuthHint(error)
    }
    case "LinearGraphQLError": {
      return linearGraphQLHint(error)
    }
    case "SectionBatchError": {
      return sectionBatchHint(error)
    }
    case "SectionNotFoundError": {
      return availableHeadingsHint(error)
    }
    default: {
      return hintOfTag(error._tag)
    }
  }
}

const detailsOf = (error: CodedError): Readonly<Record<string, unknown>> | undefined => {
  if (error._tag === "SectionBatchError") {
    const lines = numberArrayField(error, "lines") ?? []
    return lines.length === 0 ? undefined : { lines }
  }
  if (error._tag === "FieldSelectionError") {
    const path = stringField(error, "path")
    const validPaths = stringArrayField(error, "validPaths")
    return path === null || validPaths === null ? undefined : { path, validPaths }
  }
  return undefined
}

const report = (
  error: CodedError,
  hint: string | null,
  details?: Readonly<Record<string, unknown>>,
): TrackerError => {
  const retryAfter = fieldOf(error, "retryAfterSeconds")
  return new TrackerError({
    code: error.code,
    message: messageOf(error),
    hint,
    ...(typeof retryAfter === "number" ? { retryAfterSeconds: retryAfter } : {}),
    ...(details === undefined ? {} : { details }),
    cause: error,
  })
}

const untrustedReport = (error: unknown): TrackerError => {
  const base = {
    code: "internal" as const,
    message: messageOf(error),
    hint: debugHint,
  }
  return error === undefined ? new TrackerError(base) : new TrackerError({ ...base, cause: error })
}

const toTrackerError = (error: unknown): TrackerError => {
  if (Schema.is(TrackerError)(error)) {
    return error
  }
  if (Schema.is(CodedErrorSchema)(error)) {
    return report(error, hintOf(error), detailsOf(error))
  }
  return untrustedReport(error)
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

export { exitCodeOf, toTrackerError }
