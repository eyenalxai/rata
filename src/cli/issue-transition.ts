import { Effect, Option } from "effect"
import { Argument, Command, Flag } from "effect/cli"

import { IssueWriteApi } from "@/api/issue-write"
import { resolveBody } from "@/cli/body"
import { errorLine, reportFailure, writeJson, writeLine } from "@/cli/output"

const jsonFlag = Flag.Boolean("json").pipe(
  Flag.withDescription("Print machine-readable JSON"),
  Flag.withDefault(false),
)

const optionalText = (name: string, description: string) =>
  Flag.String(name).pipe(Flag.withDescription(description), Flag.optional)

const refArgument = Argument.String("ref").pipe(
  Argument.withDescription("Issue reference: an identifier, a UUID, or a linear.app URL"),
)

const closeCommand = Command.make(
  "close",
  {
    ref: refArgument,
    comment: optionalText("comment", "Comment to post before closing"),
    commentFile: optionalText(
      "comment-file",
      "Read the comment from a file. Use - for standard input",
    ),
    json: jsonFlag,
  },
  (config) =>
    Effect.gen(function* closeIssue() {
      const body = yield* resolveBody(
        { body: "comment", file: "comment-file" },
        config.comment,
        config.commentFile,
      )
      if (Option.isSome(body) && body.value.trim().length === 0) {
        return yield* errorLine(1, "The comment body is empty.")
      }
      const comment = Option.getOrUndefined(body)
      const api = yield* IssueWriteApi
      const issue = yield* api.close(config.ref, comment)
      if (config.json) {
        return yield* writeJson({ issue })
      }
      return yield* writeLine(
        comment === undefined
          ? `Closed ${issue.identifier}.`
          : `Closed ${issue.identifier} and posted a comment.`,
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

const reopenCommand = Command.make("reopen", { ref: refArgument, json: jsonFlag }, (config) =>
  Effect.gen(function* reopenIssue() {
    const api = yield* IssueWriteApi
    const issue = yield* api.reopen(config.ref)
    if (config.json) {
      return yield* writeJson({ issue })
    }
    return yield* writeLine(`Reopened ${issue.identifier}.`)
  }).pipe(Effect.catch(reportFailure)),
).pipe(
  Command.withDescription("Reopen an issue and move it to an unstarted state"),
  Command.withExamples([
    {
      command: "rata issue reopen RAT-42",
      description: "Reopen an issue",
    },
  ]),
)

const assignCommand = Command.make(
  "assign",
  {
    assignee: Argument.String("assignee").pipe(
      Argument.withDescription("Assignee: `me` or a user id"),
    ),
    ref: refArgument,
    json: jsonFlag,
  },
  (config) =>
    Effect.gen(function* assignIssue() {
      const api = yield* IssueWriteApi
      const issue = yield* api.assign(config.ref, config.assignee)
      if (config.json) {
        return yield* writeJson({ issue })
      }
      return yield* writeLine(
        `Assigned ${issue.identifier} to ${issue.assignee?.name ?? config.assignee}.`,
      )
    }).pipe(Effect.catch(reportFailure)),
).pipe(
  Command.withDescription("Assign an issue"),
  Command.withExamples([
    {
      command: "rata issue assign me RAT-42",
      description: "Claim an issue",
    },
  ]),
)

const unassignCommand = Command.make("unassign", { ref: refArgument, json: jsonFlag }, (config) =>
  Effect.gen(function* unassignIssue() {
    const api = yield* IssueWriteApi
    const issue = yield* api.unassign(config.ref)
    if (config.json) {
      return yield* writeJson({ issue })
    }
    return yield* writeLine(`Unassigned ${issue.identifier}.`)
  }).pipe(Effect.catch(reportFailure)),
).pipe(
  Command.withDescription("Remove the assignee of an issue"),
  Command.withExamples([
    {
      command: "rata issue unassign RAT-42",
      description: "Unassign an issue",
    },
  ]),
)

export { assignCommand, closeCommand, reopenCommand, unassignCommand }
