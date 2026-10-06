import { Config, Console, Effect, Option, Result, Schema } from "effect"

import { maxPageSize } from "@/api/pagination"

const jsonOutput = Schema.fromJsonString(Schema.Unknown, { space: 2 })
const defectJson = Schema.Defect()

type ReportedError = {
  readonly message: string
  readonly cause?: unknown
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

const writeJson = (value: unknown): Effect.Effect<void> =>
  Effect.sync(() => {
    const encoded = Schema.encodeResult(jsonOutput)(value)
    if (Result.isFailure(encoded)) {
      throw new Error("could not serialize the output as JSON", { cause: encoded.failure })
    }
    return encoded.success
  }).pipe(Effect.flatMap((text) => Console.log(text)))

const writeLine = (line: string): Effect.Effect<void> => Console.log(line)

const errorLine = (code: number, message: string): Effect.Effect<void> =>
  Effect.gen(function* writeErrorLine() {
    yield* Console.error(`error: ${message}`)
    yield* Effect.sync(() => {
      process.exitCode = code
    })
  })

const nextPageHint = (name: string, endCursor: string): string =>
  `More ${name} available. Continue with --after ${endCursor}`

const validatePageSize = (limit: number): Effect.Effect<boolean> =>
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

const isEnabledFlag = (value: string): boolean => value !== "" && value !== "0" && value !== "false"

const reportFailure = (error: ReportedError): Effect.Effect<void> =>
  Effect.gen(function* report() {
    yield* errorLine(1, error.message)
    const debug = yield* Config.String("RATA_DEBUG").pipe(Config.option, Effect.orDie)
    if (Option.exists(debug, isEnabledFlag)) {
      yield* Console.error(debugText(error))
    }
  })

export { errorLine, nextPageHint, reportFailure, validatePageSize, writeJson, writeLine }
