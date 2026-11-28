import type { Option } from "effect"

import { Effect, Stdio, Stream } from "effect"
import { Flag } from "effect/cli"

import { resolveBody } from "@/cli/body"
import { toTrackerError } from "@/cli/error-report"
import { TrackerError } from "@/domain/error"
import { maxPageSize } from "@/linear/connection"

const bodyFileFlag = Flag.String("body-file").pipe(
  Flag.withDescription("Read the body from a file. Use - for standard input"),
  Flag.optional,
)

const ifUnchangedFlag = Flag.String("if-unchanged").pipe(
  Flag.withDescription("Fail with a conflict when the snapshot changed since it was read"),
  Flag.optional,
)

const readBodyInput = (body: Option.Option<string>, bodyFile: Option.Option<string>) =>
  resolveBody({ body: "body", file: "body-file" }, body, bodyFile).pipe(
    Effect.mapError(toTrackerError),
  )

const readStandardInput = Effect.fn("Cli.readStandardInput")(function* readStandardInputEffect() {
  const stdio = yield* Stdio.Stdio
  return yield* stdio.stdin.pipe(
    Stream.decodeText(),
    Stream.mkString,
    Effect.mapError(
      () =>
        new TrackerError({
          code: "internal",
          message: "Could not read standard input.",
          hint: null,
        }),
    ),
  )
})

const requirePageSize = (limit: number): Effect.Effect<number, TrackerError> => {
  if (limit < 1) {
    return Effect.fail(
      new TrackerError({
        code: "validation",
        message: "The --limit flag must be at least 1.",
        hint: null,
      }),
    )
  }
  if (limit > maxPageSize) {
    return Effect.fail(
      new TrackerError({
        code: "validation",
        message: `The --limit flag must be at most ${maxPageSize}.`,
        hint: null,
      }),
    )
  }
  return Effect.succeed(limit)
}

export { bodyFileFlag, ifUnchangedFlag, readBodyInput, readStandardInput, requirePageSize }
