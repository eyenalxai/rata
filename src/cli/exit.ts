import type { CliError } from "effect/cli"

import { Effect } from "effect"

import { exitCodeOf } from "@/cli/error-report"

const exitCodeOfCliError = (error: CliError.CliError): number =>
  error._tag === "ShowHelp" && error.errors.length === 0 ? 0 : exitCodeOf("validation")

const reportCliError = (error: CliError.CliError): Effect.Effect<void> =>
  Effect.sync(() => {
    process.exitCode = exitCodeOfCliError(error)
  })

export { exitCodeOfCliError, reportCliError }
