import type { CliError } from "effect/cli"

import { Effect } from "effect"

import { exitCodeOf } from "@/cli/error-report"
import { writeTrackerError } from "@/cli/output"
import { TrackerError } from "@/domain/error"

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

const cliTrackerError = (error: CliError.CliError): TrackerError =>
  new TrackerError({
    code: "usage",
    message: messageOf(error),
    hint: hintOf(error),
  })

const reportCliError = (error: CliError.CliError, json: boolean): Effect.Effect<void> =>
  Effect.gen(function* reportCliErrorEffect() {
    if (error._tag === "ShowHelp" && error.errors.length === 0) {
      yield* Effect.sync(() => {
        process.exitCode = 0
      })
      return
    }
    yield* writeTrackerError(cliTrackerError(error), json)
  })

export { exitCodeOfCliError, reportCliError }
