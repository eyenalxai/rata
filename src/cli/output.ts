import { Config, Console, Effect, Option, Predicate, Result, Schema } from "effect"
import { Flag, GlobalFlag } from "effect/cli"

import type { CliExit } from "@/cli/spec"
import type { ErrorCode } from "@/domain/error"
import type { PlanAction } from "@/domain/plan"
import type { IssueSummary } from "@/tracker/model"
import type { BulkWriteResult, BulkWriteSuccess } from "@/tracker/write/model"

import { commandError, exitCodeOf, toTrackerError } from "@/cli/error-report"
import { TrackerError } from "@/domain/error"
import { maxPageSize } from "@/linear/connection"

const jsonOutput = Schema.fromJsonString(Schema.Unknown, { space: 2 })
const defectJson = Schema.Defect()

const jsonText = (value: unknown): Effect.Effect<string, TrackerError> =>
  Schema.encodeEffect(jsonOutput)(value).pipe(
    Effect.mapError(
      () =>
        new TrackerError({
          code: "internal",
          message: "Could not encode the JSON output.",
          hint: null,
        }),
    ),
  )

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

const encodeCause = (cause: unknown): unknown => {
  const encoded = Schema.encodeResult(defectJson)(cause)
  return Result.isSuccess(encoded) ? encoded.success : cause
}

const errorLike = (
  error: unknown,
): error is { readonly message: string; readonly cause?: unknown } =>
  Predicate.isObject(error) && Predicate.isString(Reflect.get(error, "message"))

const debugValue = (error: unknown): object => {
  if (!errorLike(error)) {
    return { error }
  }
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

const debugText = (error: unknown): string => {
  const encoded = Schema.encodeResult(jsonOutput)(debugValue(error))
  if (Result.isSuccess(encoded)) {
    return encoded.success
  }
  return errorLike(error) ? error.message : String(error)
}

const fallbackErrorJson =
  '{"error":{"code":"internal","message":"Could not serialize the error.","hint":null}}'

const errorJsonText = (value: unknown): string => {
  const encoded = Schema.encodeResult(jsonOutput)(value)
  return Result.isSuccess(encoded) ? encoded.success : fallbackErrorJson
}

const writeJson = (value: unknown): Effect.Effect<void> =>
  Effect.sync(() => {
    const encoded = Schema.encodeResult(jsonOutput)(value)
    if (Result.isFailure(encoded)) {
      throw new Error("could not serialize the output as JSON", { cause: encoded.failure })
    }
    return encoded.success
  }).pipe(Effect.flatMap((text) => Console.log(text)))

const writeLine = (line: string): Effect.Effect<void> => Console.log(line)

const warningLine = (message: string): Effect.Effect<void> => Console.error(`warning: ${message}`)

const writeDryRun = <A extends PlanAction>(
  json: boolean,
  actions: readonly A[],
  format: (action: A) => string,
): Effect.Effect<void> =>
  json
    ? writeJson({ dryRun: true, actions })
    : Effect.forEach(actions, (action) => writeLine(format(action)), { discard: true })

const noChange = (result: { readonly status: string }): string =>
  result.status === "skipped" ? " (no change)" : ""

type BulkJsonResult = {
  readonly identifier: string
  readonly status: "updated" | "skipped" | "failed"
  readonly issue?: IssueSummary | undefined
  readonly error?: Readonly<Record<string, unknown>> | undefined
}

const publicError = (report: TrackerError): Record<string, unknown> => ({
  code: report.code,
  message: report.message,
  hint: report.hint,
  ...(report.retryAfterSeconds === undefined
    ? {}
    : { retryAfterSeconds: report.retryAfterSeconds }),
  ...(report.details === undefined ? {} : { details: report.details }),
})

const bulkJsonResult = (result: BulkWriteResult): BulkJsonResult =>
  result.status === "failed"
    ? {
        identifier: result.identifier,
        status: result.status,
        error: publicError(toTrackerError(result.error)),
      }
    : {
        identifier: result.identifier,
        status: result.status,
        issue: result.issue,
      }

const failureLine = (result: BulkWriteResult & { readonly status: "failed" }): string => {
  const report = toTrackerError(result.error)
  const hint = report.hint === null ? "" : ` (hint: ${report.hint})`
  return `${result.identifier} failed: ${report.message}${hint}`
}

const writeBulkResults = (
  json: boolean,
  dryRun: boolean,
  results: readonly BulkWriteResult[],
  format: (result: BulkWriteSuccess) => string,
): Effect.Effect<number> =>
  Effect.gen(function* writeBulk() {
    const firstFailure = results.find((result) => result.status === "failed")
    yield* json
      ? writeJson({ dryRun, results: results.map(bulkJsonResult) })
      : Effect.forEach(
          results,
          (result) => writeLine(result.status === "failed" ? failureLine(result) : format(result)),
          { discard: true },
        )
    return firstFailure === undefined ? 0 : exitCodeOf(toTrackerError(firstFailure.error).code)
  })

const isEnabledFlag = (value: string): boolean => value !== "" && value !== "0" && value !== "false"

const debugEnabled: Effect.Effect<boolean> = Config.String("RATA_DEBUG").pipe(
  Config.option,
  Effect.map((debug) => Option.exists(debug, isEnabledFlag)),
  Effect.orDie,
)

const writeTrackerError = (
  report: TrackerError,
  json: boolean,
  options: {
    readonly debug?: boolean
    readonly cause?: unknown
    readonly extra?: Readonly<Record<string, unknown>>
  } = {},
): Effect.Effect<CliExit> =>
  Effect.gen(function* writeErrorReport() {
    const lines = yield* Effect.sync(() => {
      if (json) {
        const details = {
          ...report.details,
          ...(options.debug === true ? { cause: encodeCause(options.cause ?? report) } : {}),
        }
        return [
          errorJsonText({
            ...options.extra,
            error: {
              code: report.code,
              message: report.message,
              hint: report.hint,
              ...(report.retryAfterSeconds === undefined
                ? {}
                : { retryAfterSeconds: report.retryAfterSeconds }),
              ...(Object.keys(details).length === 0 ? {} : { details }),
            },
          }),
        ]
      }
      return [
        `error: ${report.message}`,
        ...(report.hint === null ? [] : [`hint: ${report.hint}`]),
        ...(options.debug === true ? [debugText(options.cause ?? report)] : []),
      ]
    })
    yield* Effect.forEach(lines, (line) => Console.error(line), { discard: true })
    return {
      code: exitCodeOf(report.code),
      output: { stream: "stderr", lines },
      error: report,
    }
  })

const reportTrackerError = (
  report: TrackerError,
  json: boolean,
  extra?: Readonly<Record<string, unknown>>,
): Effect.Effect<CliExit> =>
  Effect.gen(function* reportTrackerFailure() {
    const debug = yield* debugEnabled
    return yield* writeTrackerError(report, json, {
      debug,
      cause: report.cause,
      ...(extra === undefined ? {} : { extra }),
    })
  })

const errorLine = (code: ErrorCode, message: string, hint?: string) =>
  Effect.gen(function* writeErrorLine() {
    const json = yield* JsonOutput
    const report = commandError({ code, message, hint: hint ?? null })
    return yield* reportTrackerError(toTrackerError(report), json)
  })

const nextPageHint = (name: string, endCursor: string): string =>
  `More ${name} available. Continue with --after ${endCursor}`

const validatePageSize = (limit: number) =>
  Effect.gen(function* validate() {
    if (limit < 1) {
      yield* errorLine("validation", "The --limit flag must be at least 1.")
      return false
    }
    if (limit > maxPageSize) {
      yield* errorLine("validation", `The --limit flag must be at most ${maxPageSize}.`)
      return false
    }
    return true
  })

const reportFailure = (error: unknown) =>
  Effect.gen(function* reportFailureEffect() {
    const json = yield* JsonOutput
    return yield* reportTrackerError(toTrackerError(error), json)
  })

export {
  JsonOutput,
  dryRunFlag,
  errorLine,
  jsonText,
  nextPageHint,
  noChange,
  reportFailure,
  reportTrackerError,
  validatePageSize,
  warningLine,
  writeBulkResults,
  writeDryRun,
  writeJson,
  writeLine,
}
