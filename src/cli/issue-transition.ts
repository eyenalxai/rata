import { Effect, Option } from "effect"
import { Argument, Command, Flag } from "effect/cli"

import type { BulkWriteSuccess, WriteAction } from "@/api/issue-write/model"

import { IssueWriteApi } from "@/api/issue-write"
import { isNoneValue } from "@/api/issue-write/model"
import { resolveBody } from "@/cli/body"
import { OutputFields, rejectFields } from "@/cli/fields"
import {
  JsonOutput,
  dryRunFlag,
  errorLine,
  noChange,
  reportFailure,
  writeBulkResults,
  writeDryRun,
  writeJson,
  writeLine,
} from "@/cli/output"

const optionalText = (name: string, description: string) =>
  Flag.String(name).pipe(Flag.withDescription(description), Flag.optional)

const refArgument = Argument.String("ref").pipe(
  Argument.withDescription("Issue reference: an identifier, a UUID, or a linear.app URL"),
)

const assigneeLabel = (action: WriteAction): string => {
  const assignee = action.changes.assignee
  return typeof assignee === "string" ? assignee : "nobody"
}

const parentFlag = Flag.String("parent").pipe(
  Flag.withDescription("Apply to every child of this issue, open and closed"),
  Flag.optional,
)

const assignLine =
  (assignee: string, dryRun: boolean) =>
  (result: BulkWriteSuccess): string => {
    const clears = isNoneValue(assignee)
    const name = dryRun ? assignee : (result.issue.assignee?.name ?? assignee)
    if (dryRun) {
      return clears
        ? `Would clear the assignee of ${result.identifier}.${noChange(result)}`
        : `Would assign ${result.identifier} to ${name}.${noChange(result)}`
    }
    if (clears) {
      return result.status === "skipped"
        ? `${result.identifier} is already unassigned.`
        : `Unassigned ${result.identifier}.`
    }
    if (result.status === "skipped") {
      return `${result.identifier} is already assigned to ${name}.`
    }
    return `Assigned ${result.identifier} to ${name}.`
  }

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
        return yield* errorLine(1, "The comment body is empty.")
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
        return yield* writeLine(
          comment === undefined
            ? `${result.issue.identifier} is already completed.`
            : `${result.issue.identifier} is already completed and posted a comment.`,
        )
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

const reopenLine = (action: WriteAction): string =>
  `Would reopen ${action.target}.${noChange(action)}`

const reopenCommand = Command.make("reopen", { ref: refArgument, dryRun: dryRunFlag }, (config) =>
  Effect.gen(function* reopenIssue() {
    const json = yield* JsonOutput
    yield* rejectFields(yield* OutputFields)
    const api = yield* IssueWriteApi
    const result = yield* api.reopen(config.ref, { dryRun: config.dryRun })
    if (config.dryRun) {
      return yield* writeDryRun(json, result.actions, reopenLine)
    }
    if (json) {
      return yield* writeJson({ issue: result.issue })
    }
    return yield* writeLine(
      result.status === "skipped"
        ? `${result.issue.identifier} is already unstarted.`
        : `Reopened ${result.issue.identifier}.`,
    )
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
    ref: refArgument.pipe(
      Argument.variadic({ min: 0, max: 2 }),
      Argument.withDescription(
        "Issue reference: an identifier, a UUID, or a linear.app URL. Optional with --parent",
      ),
    ),
    assignee: Flag.String("assignee").pipe(
      Flag.withDescription("Assignee: `me`, a user id, or `none` to clear it"),
      Flag.optional,
    ),
    parent: parentFlag,
    dryRun: dryRunFlag,
  },
  (config) =>
    Effect.gen(function* assignIssue() {
      const json = yield* JsonOutput
      yield* rejectFields(yield* OutputFields)
      const [ref, legacyAssignee] = config.ref
      const parent = Option.getOrUndefined(config.parent)
      if (legacyAssignee !== undefined) {
        return yield* errorLine(
          1,
          "The issue reference comes before the assignee.",
          `rata issue assign ${legacyAssignee} --assignee ${ref}`,
        )
      }
      const assignee = Option.getOrUndefined(config.assignee)
      if (assignee === undefined || assignee.length === 0) {
        return yield* errorLine(
          1,
          "The --assignee flag is required.",
          "rata issue assign <ref> --assignee <me|user-id|none>",
        )
      }
      if (parent !== undefined) {
        if (ref !== undefined) {
          return yield* errorLine(
            1,
            "The issue reference and --parent are mutually exclusive.",
            "Pass one of them.",
          )
        }
        const api = yield* IssueWriteApi
        const results = yield* api.assignChildren(parent, assignee, { dryRun: config.dryRun })
        return yield* writeBulkResults(
          json,
          config.dryRun,
          results,
          assignLine(assignee, config.dryRun),
        )
      }
      if (ref === undefined) {
        return yield* errorLine(
          1,
          "An issue reference or --parent is required.",
          "rata issue assign <ref> --assignee me",
        )
      }
      const api = yield* IssueWriteApi
      const result = yield* api.assign(ref, assignee, { dryRun: config.dryRun })
      if (config.dryRun) {
        return yield* writeDryRun(json, result.actions, (action) =>
          action.changes.assignee === null
            ? `Would clear the assignee of ${action.target}.${noChange(action)}`
            : `Would assign ${action.target} to ${assigneeLabel(action)}.${noChange(action)}`,
        )
      }
      if (json) {
        return yield* writeJson({ dryRun: false, status: result.status, issue: result.issue })
      }
      if (isNoneValue(assignee)) {
        return yield* writeLine(
          result.status === "skipped"
            ? `${result.issue.identifier} is already unassigned.`
            : `Unassigned ${result.issue.identifier}.`,
        )
      }
      if (result.status === "skipped") {
        return yield* writeLine(
          `${result.issue.identifier} is already assigned to ${
            result.issue.assignee?.name ?? assignee
          }.`,
        )
      }
      return yield* writeLine(
        `Assigned ${result.issue.identifier} to ${result.issue.assignee?.name ?? assignee}.`,
      )
    }).pipe(Effect.catch(reportFailure)),
).pipe(
  Command.withDescription("Assign an issue, or every child of a parent issue"),
  Command.withExamples([
    {
      command: "rata issue assign RAT-42 --assignee me",
      description: "Claim an issue",
    },
    {
      command: "rata issue assign RAT-42 --assignee none",
      description: "Clear the assignee",
    },
    {
      command: "rata issue assign --parent RAT-1 --assignee me",
      description: "Assign every child of an issue",
    },
  ]),
)

const unassignCommand = Command.make(
  "unassign",
  { ref: refArgument, dryRun: dryRunFlag },
  (config) =>
    Effect.gen(function* unassignIssue() {
      const json = yield* JsonOutput
      yield* rejectFields(yield* OutputFields)
      const api = yield* IssueWriteApi
      const result = yield* api.unassign(config.ref, { dryRun: config.dryRun })
      if (config.dryRun) {
        return yield* writeDryRun(
          json,
          result.actions,
          (action) => `Would unassign ${action.target}.${noChange(action)}`,
        )
      }
      if (json) {
        return yield* writeJson({ dryRun: false, status: result.status, issue: result.issue })
      }
      return yield* writeLine(
        result.status === "skipped"
          ? `${result.issue.identifier} is already unassigned.`
          : `Unassigned ${result.issue.identifier}.`,
      )
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
