import { Predicate, Schema } from "effect"

import type { ErrorCode } from "@/domain/error"
import type { ApplyErrorClassifier, ApplyPlanError } from "@/tracker/plan"

import { TrackerError } from "@/domain/error"

type ErrorRule = {
  readonly code: ErrorCode
  readonly hint: string | null
}

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

const errorRules = {
  LinearAuthError: { code: "auth", hint: "Run `rata admin auth login --with-token`." },
  LinearNetworkError: { code: "network", hint: "Check the connection and retry." },
  LinearRateLimitError: { code: "rate_limited", hint: "Retry later." },
  TeamResolutionError: { code: "not_linked", hint: null },
  TeamNotFoundError: {
    code: "not_found",
    hint: "A team key and an issue identifier prefix can differ after a rename. Run `rata admin team list` to see the team keys, then run `rata admin link --team <key>` to repair the link.",
  },
  ContextCacheError: { code: "internal", hint: "Run with RATA_DEBUG=1 for details." },
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
  RepoConfigError: { code: "internal", hint: "Run with RATA_DEBUG=1 for details." },
  IssueRefNotFoundError: { code: "not_found", hint: "Check the reference and retry." },
  IssueWriteError: { code: "internal", hint: "Run with RATA_DEBUG=1 for details." },
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
} as const satisfies Record<string, ErrorRule>

const isErrorRuleKey = (tag: string): tag is keyof typeof errorRules =>
  Object.hasOwn(errorRules, tag)

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

const rule =
  (key: keyof typeof errorRules): ApplyErrorClassifier =>
  (error) =>
    report(error, errorRules[key].code, errorRules[key].hint)

const conflictHint = (error: unknown): string | null => {
  const current = stringField(error, "current")
  return current === null
    ? null
    : `The current updatedAt is ${current}. Re-read the issue and retry.`
}

const conflictReport = (error: unknown): TrackerError =>
  report(error, "conflict", conflictHint(error))

const sectionNotFoundReport = (error: unknown): TrackerError =>
  report(error, "not_found", availableHeadingsHint(error))

const linearAuthError = (error: unknown): TrackerError =>
  fieldOf(error, "status") === 403
    ? report(error, "forbidden", "Ask a workspace admin for access.")
    : report(error, errorRules.LinearAuthError.code, errorRules.LinearAuthError.hint)

const linearGraphQLError = (error: unknown): TrackerError => {
  const text = messageOf(error).toLowerCase()
  if (text.includes("duplicate") || text.includes("already exists")) {
    return report(error, "conflict", "Use the existing object, or pass `--if-not-exists`.")
  }
  if (text.includes("not found")) {
    return report(error, "not_found", "Check the reference and retry.")
  }
  return report(error, "internal", "Run with RATA_DEBUG=1 for details.")
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
    return sectionNotFoundReport(error)
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
    return conflictReport(error)
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
  if (tag === "LinearAuthError") {
    return linearAuthError(error)
  }
  const errorRule = tag !== undefined && isErrorRuleKey(tag) ? errorRules[tag] : undefined
  return errorRule === undefined ? undefined : report(error, errorRule.code, errorRule.hint)
}

const classifyUnclassified = (error: unknown): TrackerError =>
  tagOf(error) === "LinearGraphQLError"
    ? linearGraphQLError(error)
    : report(error, "internal", "Run with RATA_DEBUG=1 for details.")

const toTrackerError = (error: unknown): TrackerError => {
  if (Schema.is(TrackerError)(error)) {
    return error
  }
  const tagged = classifyTagged(error)
  if (tagged !== undefined) {
    return tagged
  }
  return classifyUnclassified(error)
}

type WriteErrorTag = Exclude<ApplyPlanError["_tag"], "TrackerError">

const writeErrorClassifiers = {
  AssigneeInputError: rule("AssigneeInputError"),
  AuthStoreError: rule("AuthStoreError"),
  ConflictError: conflictReport,
  ContextCacheError: rule("ContextCacheError"),
  ContextLabelNotFoundError: rule("ContextLabelNotFoundError"),
  ContextStateNotFoundError: rule("ContextStateNotFoundError"),
  DatabaseError: rule("DatabaseError"),
  InvalidIssueRef: rule("InvalidIssueRef"),
  IssueRefNotFoundError: rule("IssueRefNotFoundError"),
  IssueWriteError: rule("IssueWriteError"),
  LabelNotFoundError: rule("LabelNotFoundError"),
  LinearAuthError: linearAuthError,
  LinearGraphQLError: linearGraphQLError,
  LinearInternalError: rule("LinearInternalError"),
  LinearNetworkError: rule("LinearNetworkError"),
  LinearRateLimitError: rule("LinearRateLimitError"),
  ProjectNotFoundError: rule("ProjectNotFoundError"),
  RepoConfigError: rule("RepoConfigError"),
  SectionAmbiguousError: rule("SectionAmbiguousError"),
  SectionBatchError: sectionBatchReport,
  SectionNotFoundError: sectionNotFoundReport,
  TeamNotFoundError: rule("TeamNotFoundError"),
  TeamResolutionError: rule("TeamResolutionError"),
} satisfies Record<WriteErrorTag, ApplyErrorClassifier>

const classifyWriteError = (error: ApplyPlanError): TrackerError => {
  if (error._tag === "TrackerError") {
    return error
  }
  return writeErrorClassifiers[error._tag](error)
}

export { classifyWriteError, exitCodeOf, toTrackerError }
