import { Effect, Option, Result } from "effect"
import { Command, Flag } from "effect/cli"

import type { IssueSummary } from "@/api/issue-model"
import type {
  IssueUpdateOptions,
  IssueUpdatePlan,
  IssueUpdateWriteOptions,
} from "@/api/issue-write/write-types"
import type { PlanAction } from "@/cli/output"

import { IssueWriteApi } from "@/api/issue-write"
import { resolveBody } from "@/cli/body"
import { classifyError } from "@/cli/error-report"
import { OutputFields, rejectFields } from "@/cli/fields"
import { bodyFileFlag, bodyFlag, optionalText, refArgument } from "@/cli/issue-write/flags"
import {
  JsonOutput,
  dryRunFlag,
  errorLine,
  reportFailure,
  writeDryRun,
  writeJson,
  writeLine,
} from "@/cli/output"
import { resolvePriority } from "@/cli/priority"

const describeUpdatePlan = (plan: IssueUpdatePlan): string => {
  const details = Object.entries(plan.changes).map(([name, value]) => `${name} ${String(value)}`)
  return `Would update ${plan.identifier}: ${details.join(", ")}.`
}

const previewUpdate = (
  api: IssueWriteApi["Service"],
  json: boolean,
  ref: string,
  options: IssueUpdateOptions,
  writeOptions: IssueUpdateWriteOptions,
  comment: Option.Option<string>,
) =>
  Effect.gen(function* previewUpdateEffect() {
    const plan = yield* api.planUpdate(ref, options, writeOptions)
    const updates = Object.keys(plan.changes).length > 0
    const actions: PlanAction[] = []
    if (updates) {
      actions.push({
        action: "update",
        target: plan.identifier,
        changes: plan.changes,
        ...(plan.diff === null ? {} : { diff: plan.diff }),
      })
    }
    if (Option.isSome(comment)) {
      actions.push({
        action: "comment-create",
        target: plan.identifier,
        changes: { body: comment.value },
      })
    }
    yield* writeDryRun(json, actions, (action) =>
      action.action === "comment-create"
        ? `Would comment on ${plan.identifier}.`
        : describeUpdatePlan(plan),
    )
    if (!json && updates && plan.diff !== null) {
      yield* writeLine(plan.diff.length === 0 ? "No changes." : plan.diff)
    }
  })

const postUpdateComment = (
  api: IssueWriteApi["Service"],
  json: boolean,
  ref: string,
  issue: IssueSummary,
  body: string,
) =>
  Effect.gen(function* postUpdateCommentEffect() {
    const created = yield* Effect.result(api.commentCreate(ref, body, { waitSeconds: 0 }))
    if (Result.isFailure(created)) {
      const report = classifyError(created.failure)
      if (!json) {
        yield* writeLine(`Updated ${issue.identifier}.`)
        return yield* errorLine(1, report.message, report.hint ?? undefined)
      }
      yield* writeJson({ issue, comment: null, error: report })
      yield* Effect.sync(() => {
        process.exitCode = 1
      })
      return yield* Effect.void
    }
    if (json) {
      return yield* writeJson({ issue, comment: created.success.comment })
    }
    return yield* writeLine(`Updated ${issue.identifier} and commented.`)
  })

const updateCommand = Command.make(
  "update",
  {
    ref: refArgument,
    title: optionalText("title", "New title"),
    body: bodyFlag,
    bodyFile: bodyFileFlag,
    state: optionalText("state", "Workflow state name"),
    assignee: optionalText("assignee", "Assignee: `me` or a user id"),
    project: optionalText("project", "Project id or name"),
    parent: optionalText("parent", "Parent issue reference"),
    priority: optionalText("priority", "Priority: none, urgent, high, medium, low, or 0-4"),
    append: Flag.Boolean("append").pipe(
      Flag.withDescription("Append the body to the end of the description"),
      Flag.withDefault(false),
    ),
    comment: optionalText("comment", "Comment to post after the update"),
    commentFile: optionalText(
      "comment-file",
      "Read the comment from a file. Use - for standard input",
    ),
    dryRun: dryRunFlag,
    ifUnchanged: optionalText(
      "if-unchanged",
      "Write only when the issue updatedAt still matches this value",
    ),
  },
  (config) =>
    Effect.gen(function* updateIssue() {
      const json = yield* JsonOutput
      yield* rejectFields(yield* OutputFields)
      const body = yield* resolveBody(
        { body: "body", file: "body-file" },
        config.body,
        config.bodyFile,
      )
      const comment = yield* resolveBody(
        { body: "comment", file: "comment-file" },
        config.comment,
        config.commentFile,
      )
      if (config.append && Option.isNone(body)) {
        return yield* errorLine(1, "The --append flag needs --body or --body-file.")
      }
      if (config.append && Option.isSome(body) && body.value.trim().length === 0) {
        return yield* errorLine(1, "The body to append is empty.")
      }
      if (Option.isSome(comment) && comment.value.trim().length === 0) {
        return yield* errorLine(1, "The comment body is empty.")
      }
      const priority = Option.getOrUndefined(yield* resolvePriority(config.priority))
      const options = {
        title: Option.getOrUndefined(config.title),
        body: Option.getOrUndefined(body),
        state: Option.getOrUndefined(config.state),
        assignee: Option.getOrUndefined(config.assignee),
        project: Option.getOrUndefined(config.project),
        parent: Option.getOrUndefined(config.parent),
        priority,
        ...(config.append ? { append: true } : {}),
      }
      if (Object.values(options).every((value) => value === undefined) && Option.isNone(comment)) {
        return yield* errorLine(
          1,
          "Pass at least one of --title, --body, --state, --assignee, --project, --parent, --priority or --comment.",
        )
      }
      const api = yield* IssueWriteApi
      const writeOptions = { ifUnchanged: Option.getOrUndefined(config.ifUnchanged) }
      if (config.dryRun) {
        return yield* previewUpdate(api, json, config.ref, options, writeOptions, comment)
      }
      const issue = yield* api.update(config.ref, options, writeOptions)
      if (Option.isNone(comment)) {
        if (json) {
          return yield* writeJson({ issue })
        }
        return yield* writeLine(`Updated ${issue.identifier}.`)
      }
      return yield* postUpdateComment(api, json, config.ref, issue, comment.value)
    }).pipe(Effect.catch(reportFailure)),
).pipe(
  Command.withDescription("Update an issue"),
  Command.withExamples([
    {
      command: 'rata issue update RAT-42 --state "In Progress" --assignee me',
      description: "Move an issue to a state and claim it",
    },
    {
      command: "rata issue update RAT-42 --priority high",
      description: "Set the priority",
    },
    {
      command: 'printf "\\nUpdate." | rata issue update RAT-42 --body-file - --append',
      description: "Append to the description",
    },
    {
      command: 'rata issue update RAT-42 --state Done --comment "Shipped in PR #12."',
      description: "Change the state and post the comment in one call",
    },
  ]),
)

export { updateCommand }
