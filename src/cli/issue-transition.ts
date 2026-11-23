import { Effect, Option } from "effect"
import { Argument, Command, Flag } from "effect/cli"

import type { WriteAction } from "@/tracker/write/model"

import { IssueWriteApi } from "@/api/issue-write"
import { resolveBody } from "@/cli/body"
import { OutputFields, rejectFields } from "@/cli/fields"
import {
  JsonOutput,
  dryRunFlag,
  errorLine,
  noChange,
  reportFailure,
  writeDryRun,
  writeJson,
  writeLine,
} from "@/cli/output"

const optionalText = (name: string, description: string) =>
  Flag.String(name).pipe(Flag.withDescription(description), Flag.optional)

const refArgument = Argument.String("ref").pipe(
  Argument.withDescription("Issue reference: an identifier, a UUID, or a linear.app URL"),
)

const closeLine = (action: WriteAction): string =>
  action.action === "comment-create"
    ? `Would comment on ${action.target}.`
    : `Would close ${action.target}.${noChange(action)}`

const closeCommand = Command.make(
  "close",
  {
    ref: refArgument,
    comment: optionalText("comment", "Comment to post before closing"),
    commentFile: optionalText(
      "comment-file",
      "Read the comment from a file. Use - for standard input",
    ),
    dryRun: dryRunFlag,
  },
  (config) =>
    Effect.gen(function* closeIssue() {
      const json = yield* JsonOutput
      yield* rejectFields(yield* OutputFields)
      const body = yield* resolveBody(
        { body: "comment", file: "comment-file" },
        config.comment,
        config.commentFile,
      )
      if (Option.isSome(body) && body.value.trim().length === 0) {
        return yield* errorLine("validation", "The comment body is empty.")
      }
      const comment = Option.getOrUndefined(body)
      const api = yield* IssueWriteApi
      const result = yield* api.close(config.ref, comment, { dryRun: config.dryRun })
      if (config.dryRun) {
        return yield* writeDryRun(json, result.actions, closeLine)
      }
      if (json) {
        return yield* writeJson({ dryRun: false, status: result.status, issue: result.issue })
      }
      if (result.actions[0]?.status === "skipped") {
        return yield* writeLine(`${result.issue.identifier} is already completed.`)
      }
      return yield* writeLine(
        comment === undefined
          ? `Closed ${result.issue.identifier}.`
          : `Closed ${result.issue.identifier} and posted a comment.`,
      )
    }).pipe(Effect.catch(reportFailure)),
).pipe(
  Command.withDescription("Close an issue and move it to a completed state"),
  Command.withExamples([
    {
      command: 'rata issue close RAT-42 --comment "Done in PR #12"',
      description: "Close an issue with a comment",
    },
  ]),
)

export { closeCommand }
