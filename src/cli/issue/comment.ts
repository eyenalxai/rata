import { Effect, Option } from "effect"
import { Argument, Command, Flag } from "effect/cli"

import { IssueWriteApi } from "@/api/issue-write"
import { confirm } from "@/cli/confirm"
import { OutputFields, rejectFields } from "@/cli/fields"
import {
  bodyFileFlag,
  bodyFlag,
  optionalText,
  refArgument,
  resolveCommentBody,
  validateWait,
  waitFlag,
  warnWhenInvisible,
} from "@/cli/issue-write/flags"
import {
  JsonOutput,
  dryRunFlag,
  errorLine,
  reportFailure,
  writeJson,
  writeLine,
} from "@/cli/output"

const commentIdArgument = Argument.String("comment-id").pipe(Argument.withDescription("Comment id"))

const dedupeKeyFlag = optionalText(
  "dedupe-key",
  "Stable key: the same key on the same issue returns the existing comment",
)

const requireCommentFlag = (body: Option.Option<string>, bodyFile: Option.Option<string>) =>
  Option.isNone(body) && Option.isNone(bodyFile)
    ? errorLine("validation", "A comment needs --body or --body-file.")
    : Effect.void

const createCommand = Command.make(
  "create",
  {
    ref: refArgument,
    body: bodyFlag,
    bodyFile: bodyFileFlag,
    dedupeKey: dedupeKeyFlag,
    wait: waitFlag,
    dryRun: dryRunFlag,
  },
  (config) =>
    Effect.gen(function* createComment() {
      const json = yield* JsonOutput
      yield* rejectFields(yield* OutputFields)
      const waitSeconds = Option.getOrUndefined(config.wait)
      if (!(yield* validateWait(waitSeconds))) {
        return yield* Effect.void
      }
      const body = yield* resolveCommentBody(
        { body: "body", file: "body-file" },
        config.body,
        config.bodyFile,
      )
      if (Option.isNone(body)) {
        return yield* requireCommentFlag(config.body, config.bodyFile)
      }
      const api = yield* IssueWriteApi
      if (config.dryRun) {
        const plan = yield* api.planCommentCreate(config.ref, body.value, {
          dedupeKey: Option.getOrUndefined(config.dedupeKey),
        })
        if (json) {
          return yield* writeJson({
            dryRun: true,
            action: plan.action,
            target: plan.target,
            status: plan.status,
            changes: plan.changes,
          })
        }
        return yield* writeLine(
          plan.status === "skipped"
            ? `Comment already exists on ${config.ref}.`
            : plan.changes.body,
        )
      }
      const result = yield* api.commentCreate(config.ref, body.value, {
        dedupeKey: Option.getOrUndefined(config.dedupeKey),
        waitSeconds,
      })
      if (json) {
        return yield* writeJson({
          status: result.status,
          comment: result.comment,
          visible: result.visible,
        })
      }
      if (result.status === "skipped") {
        return yield* writeLine(`Comment already exists on ${config.ref}.`)
      }
      yield* writeLine(`Commented on ${config.ref}.`)
      return yield* warnWhenInvisible(
        result.visible,
        `The comment is not visible on ${config.ref} yet. Linear may catch up later.`,
      )
    }).pipe(Effect.catch(reportFailure)),
).pipe(
  Command.withDescription("Create a comment on an issue"),
  Command.withExamples([
    {
      command: 'rata issue comment create RAT-42 --body "Looks good."',
      description: "Comment on an issue",
    },
    {
      command: 'rata issue comment create RAT-42 --body "Handoff." --dedupe-key mission-42-handoff',
      description: "Post the comment once, even when the command is retried",
    },
    {
      command: 'rata issue comment create RAT-42 --body "Looks good." --wait 0',
      description: "Skip the read-after-write check",
    },
  ]),
)

const updateCommand = Command.make(
  "update",
  {
    commentId: commentIdArgument,
    body: bodyFlag,
    bodyFile: bodyFileFlag,
    dryRun: dryRunFlag,
  },
  (config) =>
    Effect.gen(function* updateComment() {
      const json = yield* JsonOutput
      yield* rejectFields(yield* OutputFields)
      const body = yield* resolveCommentBody(
        { body: "body", file: "body-file" },
        config.body,
        config.bodyFile,
      )
      if (Option.isNone(body)) {
        return yield* requireCommentFlag(config.body, config.bodyFile)
      }
      const api = yield* IssueWriteApi
      const result = yield* api.commentUpdate(config.commentId, body.value, {
        dryRun: config.dryRun,
      })
      if (result.dryRun) {
        return yield* json
          ? writeJson({
              dryRun: true,
              action: result.action,
              target: result.target,
              diff: result.diff,
            })
          : writeLine(result.diff.length === 0 ? "No changes." : result.diff)
      }
      if (json) {
        return yield* writeJson({ comment: result.comment })
      }
      return yield* writeLine(`Updated comment ${config.commentId}.`)
    }).pipe(Effect.catch(reportFailure)),
).pipe(
  Command.withDescription("Replace the body of one comment"),
  Command.withExamples([
    {
      command: 'rata issue comment update c1 --body "Revised."',
      description: "Replace a comment body",
    },
    {
      command: "rata issue comment update c1 --body-file - --dry-run",
      description: "Preview the change as a unified diff",
    },
  ]),
)

const deleteCommand = Command.make(
  "delete",
  {
    commentId: commentIdArgument,
    yes: Flag.Boolean("yes").pipe(
      Flag.withDescription("Skip the confirmation prompt"),
      Flag.withDefault(false),
    ),
    dryRun: dryRunFlag,
  },
  (config) =>
    Effect.gen(function* deleteComment() {
      const json = yield* JsonOutput
      yield* rejectFields(yield* OutputFields)
      if (json && !config.yes) {
        return yield* errorLine(
          "validation",
          "Deleting a comment in JSON mode needs --yes.",
          "Pass --yes to delete a comment in JSON mode.",
        )
      }
      const api = yield* IssueWriteApi
      const plan = yield* api.planCommentDelete(config.commentId)
      if (config.dryRun) {
        return yield* json
          ? writeJson({
              dryRun: true,
              action: plan.action,
              target: plan.target,
              comment: plan.comment,
            })
          : writeLine(plan.comment.body)
      }
      if (!config.yes) {
        const confirmed = yield* confirm(`Delete comment ${config.commentId}?`, false)
        if (!confirmed) {
          return yield* writeLine("Aborted.")
        }
      }
      const result = yield* api.commentDelete(config.commentId)
      if (json) {
        return yield* writeJson({ deleted: true, id: result.commentId })
      }
      return yield* writeLine(`Deleted comment ${config.commentId}.`)
    }).pipe(Effect.catch(reportFailure)),
).pipe(
  Command.withDescription("Move a comment to the trash"),
  Command.withExamples([
    {
      command: "rata issue comment delete c1 --yes",
      description: "Delete a comment without a prompt; Linear keeps it recoverable",
    },
    {
      command: "rata issue comment delete c1 --dry-run",
      description: "Check that the comment exists without deleting it",
    },
  ]),
)

const commentCommand = Command.make("comment").pipe(
  Command.withDescription("Create, update and delete comments"),
  Command.withSubcommands([createCommand, updateCommand, deleteCommand]),
)

export { commentCommand }
