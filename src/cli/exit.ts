import type { CliError } from "effect/cli"

import { Console, Effect } from "effect"

import { exitCodeOf } from "@/cli/error-report"
import { writeJsonError } from "@/cli/output"

const exitCodeOfCliError = (error: CliError.CliError): number =>
  error._tag === "ShowHelp" && error.errors.length === 0 ? 0 : exitCodeOf("validation")

const messageOf = (error: CliError.CliError): string =>
  error._tag === "ShowHelp"
    ? (error.errors[0]?.message ?? "Invalid command arguments.")
    : error.message

const hintOf = (error: CliError.CliError): string => {
  const path = error._tag === "ShowHelp" ? error.commandPath.join(" ") : "rata"
  return `Run \`${path} --help\` for usage.`
}

const reportCliError = (error: CliError.CliError, json: boolean): Effect.Effect<void> =>
  Effect.gen(function* reportCliErrorEffect() {
    if (error._tag === "ShowHelp" && error.errors.length === 0) {
      yield* Effect.sync(() => {
        process.exitCode = 0
      })
      return
    }
    const message = messageOf(error)
    const hint = hintOf(error)
    if (json) {
      yield* writeJsonError({ error: { code: "usage", message, hint } })
    } else {
      yield* Console.error(`error: ${message}`)
      yield* Console.error(`hint: ${hint}`)
    }
    yield* Effect.sync(() => {
      process.exitCode = exitCodeOf("validation")
    })
  })

export { exitCodeOfCliError, reportCliError }
