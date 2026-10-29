import { Effect, Option } from "effect"
import { Argument, Flag } from "effect/cli"

import type { WriteVisibility } from "@/api/issue-write/write-types"

import { resolveBody } from "@/cli/body"
import { errorLine, warningLine } from "@/cli/output"

const optionalText = (name: string, description: string) =>
  Flag.String(name).pipe(Flag.withDescription(description), Flag.optional)

const refArgument = Argument.String("ref").pipe(
  Argument.withDescription("Issue reference: an identifier, a UUID, or a linear.app URL"),
)

const bodyFlag = optionalText("body", "Body text in markdown")
const bodyFileFlag = optionalText(
  "body-file",
  "Read the body from a file. Use - for standard input",
)

const waitFlag = Flag.Int("wait").pipe(
  Flag.withDescription(
    "Seconds to wait for the write to appear on a re-read. Default 5, 0 disables",
  ),
  Flag.optional,
)

const warnWhenInvisible = (visible: WriteVisibility, message: string): Effect.Effect<void> =>
  visible === false ? warningLine(message) : Effect.void

const validateWait = (wait: number | undefined) =>
  Effect.gen(function* validateWaitEffect() {
    if (wait !== undefined && wait < 0) {
      yield* errorLine(1, "The --wait flag must be 0 or more.")
      return false
    }
    return true
  })

const resolveCommentBody = Effect.fn("Cli.IssueWrite.resolveCommentBody")(
  function* resolveCommentBody(
    flags: { readonly body: string; readonly file: string },
    body: Option.Option<string>,
    bodyFile: Option.Option<string>,
  ) {
    const resolved = yield* resolveBody(flags, body, bodyFile)
    if (Option.isNone(resolved)) {
      yield* errorLine(1, `A comment needs --${flags.body} or --${flags.file}.`)
      return Option.none<string>()
    }
    if (resolved.value.trim().length === 0) {
      yield* errorLine(1, "The comment body is empty.")
      return Option.none<string>()
    }
    return resolved
  },
)

export {
  bodyFileFlag,
  bodyFlag,
  optionalText,
  refArgument,
  resolveCommentBody,
  validateWait,
  waitFlag,
  warnWhenInvisible,
}
