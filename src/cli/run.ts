import { Effect, Runtime, Schema } from "effect"
import { CliError } from "effect/cli"

import { exitCodeOf } from "@/cli/error-report"

const isUserError = Schema.is(CliError.UserError)

const exitCodeFor = (error: CliError.CliError): number =>
  isUserError(error) ? exitCodeOf("internal") : exitCodeOf("validation")

const withCliExitCode = <A, E, R>(effect: Effect.Effect<A, E | CliError.CliError, R>) =>
  effect.pipe(
    Effect.catchIf(CliError.isCliError, (error) =>
      Effect.fail(
        Object.assign(error, {
          [Runtime.errorExitCode]: exitCodeFor(error),
          [Runtime.errorReported]: true,
        }),
      ),
    ),
  )

export { withCliExitCode }
