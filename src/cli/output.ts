import { Config, Console, Effect, Option, Result, Schema } from "effect"
import { Flag, GlobalFlag } from "effect/cli"

import { maxPageSize } from "@/api/pagination"

const jsonOutput = Schema.fromJsonString(Schema.Unknown, { space: 2 })
const defectJson = Schema.Defect()

const JsonOutput = GlobalFlag.Setting("json")({
  flag: Flag.Boolean("json").pipe(
    Flag.withDescription("Print machine-readable JSON"),
    Flag.withDefault(false),
  ),
})

const dryRunFlag = Flag.Boolean("dry-run").pipe(
  Flag.withDescription("Resolve the targets and print the actions without writing"),
  Flag.withDefault(false),
)

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
}

const encodeCause = (cause: unknown): unknown => {
  const encoded = Schema.encodeResult(defectJson)(cause)
  return Result.isSuccess(encoded) ? encoded.success : cause
}

const debugValue = (error: ReportedError): object => {
  if (error.cause === undefined) {
    return error
  }
  // The JSON encoder reads Error fields through the prototype chain.
  // A spread would drop the non-enumerable message and cause.
  const value: object = {}
  Object.setPrototypeOf(value, error)
  Object.assign(value, { cause: encodeCause(error.cause) })
  return value
}

const debugText = (error: ReportedError): string => {
  const encoded = Schema.encodeResult(jsonOutput)(debugValue(error))
  return Result.isSuccess(encoded) ? encoded.success : error.message
}

const tagOf = (error: ReportedError): string | undefined => {
  const tag: unknown = Reflect.get(error, "_tag")
  return typeof tag === "string" ? tag : undefined
}

type ErrorRule = {
  readonly code: ErrorCode
  readonly hint: string | null
}

const errorRules: Record<string, ErrorRule> = {
  LinearAuthError: { code: "auth", hint: "Run `rata auth login --with-token`." },
  LinearNetworkError: { code: "network", hint: "Check the connection and retry." },
  TeamResolutionError: { code: "not_linked", hint: null },
  TeamNotFoundError: { code: "not_found", hint: null },
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
  ProjectAlreadyDeletedError: { code: "conflict", hint: null },
  ProjectNotDeletedError: { code: "conflict", hint: null },
  StateNotFoundError: { code: "not_found", hint: null },
  InvalidIssueRef: { code: "validation", hint: null },
  InputError: { code: "validation", hint: null },
  BodyInputError: { code: "validation", hint: null },
  ColorInputError: { code: "validation", hint: null },
  PriorityInputError: { code: "validation", hint: null },
  FieldSelectionError: { code: "validation", hint: null },
  LinkError: { code: "validation", hint: null },
  AuthStoreError: { code: "auth", hint: "Run `rata auth login --with-token`." },
}

const classifyError = (error: ReportedError): ErrorReport => {
  const message = error.message
  const tag = tagOf(error)
  if (tag === "LabelExistsError") {
    const existing: unknown = Reflect.get(error, "existingName")
    const name = typeof existing === "string" ? existing : message
    return {
      code: "conflict",
      message,
      hint: `Labels resolve case-insensitively; use \`${name}\`, or pass \`--if-not-exists\`.`,
    }
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

const fallbackErrorJson =
  '{"error":{"code":"internal","message":"Could not serialize the error.","hint":null}}'

const writeJsonError = (value: unknown): Effect.Effect<void> =>
  Effect.gen(function* writeErrorJson() {
    const encoded = Schema.encodeResult(jsonOutput)(value)
    if (Result.isSuccess(encoded)) {
      return yield* Console.error(encoded.success)
    }
    return yield* Console.error(fallbackErrorJson)
  })

const writeJson = (value: unknown): Effect.Effect<void> =>
  Effect.sync(() => {
    const encoded = Schema.encodeResult(jsonOutput)(value)
    if (Result.isFailure(encoded)) {
      throw new Error("could not serialize the output as JSON", { cause: encoded.failure })
    }
    return encoded.success
  }).pipe(Effect.flatMap((text) => Console.log(text)))

const writeLine = (line: string): Effect.Effect<void> => Console.log(line)

type PlanAction = {
  readonly action: string
  readonly target: string
  readonly changes: Record<string, unknown>
}

const writeDryRun = <A extends PlanAction>(
  json: boolean,
  actions: readonly A[],
  format: (action: A) => string,
): Effect.Effect<void> =>
  json
    ? writeJson({ dryRun: true, actions })
    : Effect.forEach(actions, (action) => writeLine(format(action)), { discard: true })

const isEnabledFlag = (value: string): boolean => value !== "" && value !== "0" && value !== "false"

const debugEnabled: Effect.Effect<boolean> = Config.String("RATA_DEBUG").pipe(
  Config.option,
  Effect.map((debug) => Option.exists(debug, isEnabledFlag)),
  Effect.orDie,
)

const errorLine = (code: number, message: string, hint?: string) =>
  Effect.gen(function* writeErrorLine() {
    const json = yield* JsonOutput
    if (json) {
      yield* writeJsonError({ error: { code: "validation", message, hint: hint ?? null } })
    } else {
      yield* Console.error(`error: ${message}`)
      if (hint !== undefined) {
        yield* Console.error(`hint: ${hint}`)
      }
    }
    yield* Effect.sync(() => {
      process.exitCode = code
    })
  })

const nextPageHint = (name: string, endCursor: string): string =>
  `More ${name} available. Continue with --after ${endCursor}`

const validatePageSize = (limit: number) =>
  Effect.gen(function* validate() {
    if (limit < 1) {
      yield* errorLine(1, "The --limit flag must be at least 1.")
      return false
    }
    if (limit > maxPageSize) {
      yield* errorLine(1, `The --limit flag must be at most ${maxPageSize}.`)
      return false
    }
    return true
  })

const reportFailure = (error: ReportedError) =>
  Effect.gen(function* reportFailureEffect() {
    const json = yield* JsonOutput
    const classified = classifyError(error)
    const debug = yield* debugEnabled
    if (json) {
      yield* writeJsonError({
        error: {
          code: classified.code,
          message: classified.message,
          hint: classified.hint,
          ...(debug ? { details: encodeCause(error.cause ?? error) } : {}),
        },
      })
    } else {
      yield* Console.error(`error: ${classified.message}`)
      if (classified.hint !== null) {
        yield* Console.error(`hint: ${classified.hint}`)
      }
      if (debug) {
        yield* Console.error(debugText(error))
      }
    }
    yield* Effect.sync(() => {
      process.exitCode = 1
    })
  })

export {
  type ErrorCode,
  type ErrorReport,
  JsonOutput,
  classifyError,
  dryRunFlag,
  errorLine,
  nextPageHint,
  type PlanAction,
  reportFailure,
  validatePageSize,
  writeDryRun,
  writeJson,
  writeLine,
}
