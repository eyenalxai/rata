import { Config, Console, Effect, Option, Result, Schema } from "effect"

import type { InitFileReport } from "@/config/init"
import type { InitAction } from "@/domain/init"

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

const actionLabels: Record<InitAction, string> = {
  create: "created",
  overwrite: "overwritten",
  unchanged: "unchanged",
  skip: "skipped",
}

const formatFile = (file: InitFileReport): string => {
  const suffix = file.action === "skip" ? " (exists; pass --force to overwrite)" : ""
  return `${actionLabels[file.action]}: ${file.path}${suffix}`
}

const formatNames = (names: readonly string[]): string =>
  names.length === 0 ? "none" : names.join(", ")

const errorLine = (code: number, message: string): Effect.Effect<void> =>
  Effect.gen(function* writeErrorLine() {
    yield* Console.error(`error: ${message}`)
    yield* Effect.sync(() => {
      process.exitCode = code
    })
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

export { errorLine, formatFile, formatNames, reportFailure, writeJson, writeLine }
