type ErrorCode =
  | "validation"
  | "not_linked"
  | "not_found"
  | "ambiguous"
  | "auth"
  | "forbidden"
  | "conflict"
  | "rate_limited"
  | "network"
  | "internal"

type ReportedError = {
  readonly message: string
  readonly cause?: unknown
}

type ErrorReport = {
  readonly code: ErrorCode
  readonly message: string
  readonly hint: string | null
  readonly details?: Readonly<Record<string, unknown>>
}

type ErrorRule = {
  readonly code: ErrorCode
  readonly hint: string | null
}

const tagOf = (error: ReportedError): string | undefined => {
  const tag: unknown = Reflect.get(error, "_tag")
  return typeof tag === "string" ? tag : undefined
}

const errorRules: Record<string, ErrorRule> = {
  LinearAuthError: { code: "auth", hint: "Run `rata auth login --with-token`." },
  LinearNetworkError: { code: "network", hint: "Check the connection and retry." },
  TeamResolutionError: { code: "not_linked", hint: null },
  TeamNotFoundError: {
    code: "not_found",
    hint: "A team key and an issue identifier prefix can differ after a rename. Run `rata team list` to see the team keys, then run `rata link --team <key>` to repair the link.",
  },
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
  CommentNotFoundError: { code: "not_found", hint: "Check the comment id." },
  IssueRefNotFoundError: { code: "not_found", hint: "Check the reference and retry." },
  AssigneeInputError: {
    code: "validation",
    hint: "Use `me` or a user UUID. Run `rata team show --json` to see the members.",
  },
  AssigneeNotFoundError: {
    code: "not_found",
    hint: "Run `rata team show --json` to see the members.",
  },
  ProjectAlreadyDeletedError: { code: "conflict", hint: null },
  ProjectNotDeletedError: { code: "conflict", hint: null },
  StateNotFoundError: { code: "not_found", hint: null },
  SectionAmbiguousError: {
    code: "ambiguous",
    hint: "Rename one heading, or quote a heading that appears once.",
  },
  InvalidIssueRef: { code: "validation", hint: null },
  InputError: { code: "validation", hint: null },
  BodyInputError: { code: "validation", hint: null },
  ColorInputError: { code: "validation", hint: null },
  PriorityInputError: { code: "validation", hint: null },
  LinkError: { code: "validation", hint: null },
  AuthStoreError: { code: "auth", hint: "Run `rata auth login --with-token`." },
}

const exitCodes: Record<ErrorCode, number> = {
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

const fieldSelectionReport = (error: ReportedError, message: string): ErrorReport => {
  const hint: unknown = Reflect.get(error, "hint")
  const path: unknown = Reflect.get(error, "path")
  const validPaths: unknown = Reflect.get(error, "validPaths")
  const details =
    typeof path === "string" &&
    Array.isArray(validPaths) &&
    validPaths.every((item) => typeof item === "string")
      ? { path, validPaths }
      : undefined
  return {
    code: "validation",
    message,
    hint: typeof hint === "string" ? hint : null,
    ...(details === undefined ? {} : { details }),
  }
}

const filterSubjects = {
  state: { subject: "states", command: "rata team show --json" },
  label: { subject: "labels", command: "rata label list" },
  project: { subject: "projects", command: "rata project list" },
} as const

const isFilterName = (value: unknown): value is keyof typeof filterSubjects =>
  typeof value === "string" && Object.hasOwn(filterSubjects, value)

const filterNameReport = (error: ReportedError): ErrorReport => {
  const filter: unknown = Reflect.get(error, "filter")
  const valid: unknown = Reflect.get(error, "valid")
  const names = Array.isArray(valid) && valid.every((item) => typeof item === "string") ? valid : []
  const subject = isFilterName(filter) ? filterSubjects[filter] : undefined
  const label = subject?.subject ?? "values"
  const command = subject?.command ?? "rata team show --json"
  return {
    code: "not_found",
    message: error.message,
    hint:
      names.length === 0
        ? `Run \`${command}\` to see the ${label}.`
        : `Valid ${label}: ${names.join(", ")}.`,
  }
}

const availableHeadingsHint = (available: unknown): string => {
  const headings =
    Array.isArray(available) && available.every((item) => typeof item === "string") ? available : []
  return headings.length === 0
    ? "The issue body has no headings."
    : `Available headings: ${headings.map((heading) => `"${heading}"`).join(", ")}.`
}

const classifyError = (error: ReportedError): ErrorReport => {
  const message = error.message
  const tag = tagOf(error)
  if (tag === "SectionNotFoundError") {
    return {
      code: "not_found",
      message,
      hint: availableHeadingsHint(Reflect.get(error, "available")),
    }
  }
  if (tag === "SectionBatchError") {
    const reason: unknown = Reflect.get(error, "reason")
    return {
      code:
        reason === "missing" ? "not_found" : reason === "duplicate" ? "ambiguous" : "validation",
      message,
      hint: availableHeadingsHint(Reflect.get(error, "available")),
    }
  }
  if (tag === "FieldSelectionError") {
    return fieldSelectionReport(error, message)
  }
  if (tag === "ConflictError") {
    const current: unknown = Reflect.get(error, "current")
    return {
      code: "conflict",
      message,
      hint:
        typeof current === "string"
          ? `The current updatedAt is ${current}. Re-read the issue and retry.`
          : null,
    }
  }
  if (tag === "FilterNameNotFoundError") {
    return filterNameReport(error)
  }
  if (tag === "LabelExistsError") {
    const existing: unknown = Reflect.get(error, "existingName")
    const name = typeof existing === "string" ? existing : message
    return {
      code: "conflict",
      message,
      hint: `Labels resolve case-insensitively; use \`${name}\`, or pass \`--if-not-exists\`.`,
    }
  }
  if (tag === "LinearAuthError" && Reflect.get(error, "status") === 403) {
    return { code: "forbidden", message, hint: "Ask a workspace admin for access." }
  }
  const rule = tag === undefined ? undefined : errorRules[tag]
  if (rule !== undefined) {
    return { ...rule, message }
  }
  if (tag === "LinearRateLimitError") {
    return { code: "rate_limited", message, hint: "Retry later." }
  }
  if (tag === "LinearGraphQLError") {
    const text = message.toLowerCase()
    if (text.includes("duplicate") || text.includes("already exists")) {
      return {
        code: "conflict",
        message,
        hint: "Use the existing object, or pass `--if-not-exists`.",
      }
    }
    if (text.includes("not found")) {
      return { code: "not_found", message, hint: "Check the reference and retry." }
    }
  }
  return { code: "internal", message, hint: "Run with RATA_DEBUG=1 for details." }
}

export { classifyError, exitCodeOf, type ErrorCode, type ErrorReport, type ReportedError }
