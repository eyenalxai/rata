import { Config, Effect, Option, Result, Schema } from "effect"
import { EOL } from "node:os"

const jsonOutput = Schema.fromJsonString(Schema.Unknown, { space: 2 })

const writeJson = (value: unknown): Effect.Effect<void> =>
  Effect.sync(() => {
    const encoded = Schema.encodeResult(jsonOutput)(value)
    if (Result.isFailure(encoded)) {
      throw new Error("could not serialize the output as JSON", { cause: encoded.failure })
    }
    process.stdout.write(`${encoded.success}${EOL}`)
  })

const writeLine = (line: string): Effect.Effect<void> =>
  Effect.sync(() => {
    process.stdout.write(`${line}${EOL}`)
  })

const errorLine = (code: number, message: string): Effect.Effect<void> =>
  Effect.sync(() => {
    process.stderr.write(`error: ${message}${EOL}`)
    process.exitCode = code
  })

const isEnabledFlag = (value: string): boolean => value !== "" && value !== "0" && value !== "false"

const reportFailure = (error: { readonly message: string }): Effect.Effect<void> =>
  Effect.gen(function* report() {
    yield* errorLine(1, error.message)
    const debug = yield* Config.String("RATA_DEBUG").pipe(Config.option, Effect.orDie)
    if (Option.exists(debug, isEnabledFlag)) {
      const encoded = Schema.encodeResult(jsonOutput)(error)
      const text = Result.isSuccess(encoded) ? encoded.success : error.message
      yield* Effect.sync(() => {
        process.stderr.write(`${text}${EOL}`)
      })
    }
  })

export { errorLine, reportFailure, writeJson, writeLine }
