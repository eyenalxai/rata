import { Effect, FileSystem, Option, Schema, Stdio, Stream } from "effect"

class BodyInputError extends Schema.TaggedError<BodyInputError>()("BodyInputError", {
  message: Schema.String,
  cause: Schema.optional(Schema.Defect()),
}) {}

const readStandardInput = Effect.fn("Cli.Body.readStandardInput")(function* readStandardInput() {
  const stdio = yield* Stdio.Stdio
  const text = yield* stdio.stdin.pipe(
    Stream.decodeText(),
    Stream.mkString,
    Effect.mapError(() => new BodyInputError({ message: "Could not read standard input." })),
  )
  return text.trim()
})

type BodyFlags = {
  readonly body: string
  readonly file: string
}

const resolveBody = Effect.fn("Cli.Body.resolveBody")(function* resolveBody(
  flags: BodyFlags,
  body: Option.Option<string>,
  bodyFile: Option.Option<string>,
) {
  if (Option.isSome(body) && Option.isSome(bodyFile)) {
    return yield* new BodyInputError({
      message: `Pass --${flags.body} or --${flags.file}, not both.`,
    })
  }
  if (Option.isSome(body)) {
    return Option.some(body.value)
  }
  if (Option.isNone(bodyFile)) {
    return Option.none<string>()
  }
  if (bodyFile.value === "-") {
    return Option.some(yield* readStandardInput())
  }
  const fs = yield* FileSystem.FileSystem
  const text = yield* fs
    .readFileString(bodyFile.value)
    .pipe(
      Effect.mapError(
        (cause) => new BodyInputError({ message: `Could not read ${bodyFile.value}.`, cause }),
      ),
    )
  return Option.some(text)
})

export { BodyInputError, resolveBody }
