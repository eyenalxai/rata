import { Effect, Option } from "effect"
import { Command } from "effect/cli"

import { IssueWriteApi } from "@/api/issue-write"
import { resolveBody } from "@/cli/body"
import { OutputFields, rejectFields } from "@/cli/fields"
import {
  bodyFileFlag,
  bodyFlag,
  refArgument,
  validateWait,
  waitFlag,
  warnWhenInvisible,
} from "@/cli/issue-write/flags"
import { JsonOutput, errorLine, reportFailure, writeJson, writeLine } from "@/cli/output"

const commentCommand = Command.make(
  "comment",
  {
    ref: refArgument,
    body: bodyFlag,
    bodyFile: bodyFileFlag,
    wait: waitFlag,
  },
  (config) =>
    Effect.gen(function* commentOnIssue() {
      const json = yield* JsonOutput
      yield* rejectFields(yield* OutputFields)
      const waitSeconds = Option.getOrUndefined(config.wait)
      if (!(yield* validateWait(waitSeconds))) {
        return yield* Effect.void
      }
      const body = yield* resolveBody(
        { body: "body", file: "body-file" },
        config.body,
        config.bodyFile,
      )
      if (Option.isNone(body)) {
        return yield* errorLine(1, "A comment needs --body or --body-file.")
      }
      if (body.value.trim().length === 0) {
        return yield* errorLine(1, "The comment body is empty.")
      }
      const api = yield* IssueWriteApi
      const result = yield* api.comment(config.ref, body.value, { waitSeconds })
      if (json) {
        return yield* writeJson({ comment: result.comment, visible: result.visible })
      }
      yield* writeLine(`Commented on ${config.ref}.`)
      return yield* warnWhenInvisible(
        result.visible,
        `The comment is not visible on ${config.ref} yet. Linear may catch up later.`,
      )
    }).pipe(Effect.catch(reportFailure)),
).pipe(
  Command.withDescription("Comment on an issue"),
  Command.withExamples([
    {
      command: 'rata issue comment RAT-42 --body "Looks good."',
      description: "Comment on an issue",
    },
    {
      command: 'rata issue comment RAT-42 --body "Looks good." --wait 0',
      description: "Skip the read-after-write check",
    },
  ]),
)

export { commentCommand }
