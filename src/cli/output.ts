import { Config, Console, Effect, Option, Result, Schema } from "effect"
import { Flag, GlobalFlag } from "effect/cli"

import type { IssueSummary } from "@/api/issue-model"
import type { BulkWriteResult, BulkWriteSuccess } from "@/api/issue-write/model"
import type { ErrorCode, ErrorReport, ReportedError } from "@/cli/error-report"

import { maxPageSize } from "@/api/pagination"
import { classifyError, exitCodeOf } from "@/cli/error-report"

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

const warningLine = (message: string): Effect.Effect<void> => Console.error(`warning: ${message}`)

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

const noChange = (result: { readonly status: string }): string =>
  result.status === "skipped" ? " (no change)" : ""

type BulkJsonResult = {
  readonly identifier: string
  readonly status: "updated" | "skipped" | "failed"
  readonly issue?: IssueSummary | undefined
  readonly error?: ErrorReport | undefined
}

const bulkJsonResult = (result: BulkWriteResult): BulkJsonResult =>
  result.status === "failed"
    ? {
        identifier: result.identifier,
        status: result.status,
        error: classifyError(result.error),
      }
    : {
        identifier: result.identifier,
        status: result.status,
        issue: result.issue,
      }

const failureLine = (result: BulkWriteResult & { readonly status: "failed" }): string => {
  const report = classifyError(result.error)
  const hint = report.hint === null ? "" : ` (hint: ${report.hint})`
  return `${result.identifier} failed: ${report.message}${hint}`
}

const writeBulkResults = (
  json: boolean,
  dryRun: boolean,
  results: readonly BulkWriteResult[],
  format: (result: BulkWriteSuccess) => string,
): Effect.Effect<void> =>
  Effect.gen(function* writeBulk() {
    const firstFailure = results.find((result) => result.status === "failed")
    yield* json
      ? writeJson({ dryRun, results: results.map(bulkJsonResult) })
      : Effect.forEach(
          results,
          (result) => writeLine(result.status === "failed" ? failureLine(result) : format(result)),
          { discard: true },
        )
    if (firstFailure !== undefined && firstFailure.status === "failed") {
      const code = classifyError(firstFailure.error).code
      yield* Effect.sync(() => {
        process.exitCode = exitCodeOf(code)
      })
    }
  })

const isEnabledFlag = (value: string): boolean => value !== "" && value !== "0" && value !== "false"

const debugEnabled: Effect.Effect<boolean> = Config.String("RATA_DEBUG").pipe(
  Config.option,
  Effect.map((debug) => Option.exists(debug, isEnabledFlag)),
  Effect.orDie,
)

const errorLine = (code: ErrorCode, message: string, hint?: string) =>
  Effect.gen(function* writeErrorLine() {
    const json = yield* JsonOutput
    if (json) {
      yield* writeJsonError({ error: { code, message, hint: hint ?? null } })
    } else {
      yield* Console.error(`error: ${message}`)
      if (hint !== undefined) {
        yield* Console.error(`hint: ${hint}`)
      }
    }
    yield* Effect.sync(() => {
      process.exitCode = exitCodeOf(code)
    })
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
      process.exitCode = exitCodeOf(classified.code)
    })
  })

export {
  JsonOutput,
  dryRunFlag,
  errorLine,
  nextPageHint,
  noChange,
  type PlanAction,
  reportFailure,
  validatePageSize,
  warningLine,
  writeBulkResults,
  writeDryRun,
  writeJson,
  writeLine,
}
