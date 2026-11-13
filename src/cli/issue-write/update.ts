import { Effect, Option } from "effect"
import { Command, Flag } from "effect/cli"

import type {
  IssueUpdateOptions,
  IssueUpdatePlan,
  IssueUpdateWriteOptions,
} from "@/api/issue-write/write-types"
import type { PlanAction } from "@/cli/output"

import { IssueWriteApi } from "@/api/issue-write"
import { resolveBody } from "@/cli/body"
import { OutputFields, rejectFields } from "@/cli/fields"
import { withAgentNotes } from "@/cli/help"
import { postUpdateComment } from "@/cli/issue-write/comment"
import {
  bodyFileFlag,
  bodyFlag,
  optionalText,
  refArgument,
  resolveCommentBody,
} from "@/cli/issue-write/flags"
import {
  resolveSectionsInput,
  runSectionsUpdate,
  sectionsFileFlag,
} from "@/cli/issue-write/sections"
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

const previewUpdate = Effect.fn("Cli.IssueWrite.previewUpdate")(function* previewUpdate(
  api: IssueWriteApi["Service"],
  json: boolean,
  ref: string,
  options: IssueUpdateOptions,
  writeOptions: IssueUpdateWriteOptions,
  comment: Option.Option<string>,
) {
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

const resolveWriteInput = Effect.fn("Cli.IssueWrite.resolveWriteInput")(function* resolveWriteInput(
  bodyFlagValue: Option.Option<string>,
  bodyFileValue: Option.Option<string>,
  append: boolean,
  commentFlagValue: Option.Option<string>,
  commentFileValue: Option.Option<string>,
) {
  const body = yield* resolveBody({ body: "body", file: "body-file" }, bodyFlagValue, bodyFileValue)
  const comment = yield* resolveCommentBody(
    { body: "comment", file: "comment-file" },
    commentFlagValue,
    commentFileValue,
  )
  if (
    Option.isNone(comment) &&
    (Option.isSome(commentFlagValue) || Option.isSome(commentFileValue))
  ) {
    return Option.none()
  }
  if (append && Option.isNone(body)) {
    yield* errorLine("validation", "The --append flag needs --body or --body-file.")
    return Option.none()
  }
  if (append && Option.isSome(body) && body.value.trim().length === 0) {
    yield* errorLine("validation", "The body to append is empty.")
    return Option.none()
  }
  return Option.some({ body, comment })
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
    sectionsFile: sectionsFileFlag,
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
      const requested = yield* resolveSectionsInput(
        config.sectionsFile,
        config.body,
        config.bodyFile,
        config.append,
      )
      const sections = Option.flatMap(requested, (value) => value)
      if (Option.isSome(requested) && Option.isNone(sections)) {
        return yield* Effect.void
      }
      const input = yield* resolveWriteInput(
        config.body,
        config.bodyFile,
        config.append,
        config.comment,
        config.commentFile,
      )
      if (Option.isNone(input)) {
        return yield* Effect.void
      }
      const body = input.value.body
      const comment = input.value.comment
      const priority = Option.getOrUndefined(yield* resolvePriority(config.priority))
      const fields = {
        title: Option.getOrUndefined(config.title),
        state: Option.getOrUndefined(config.state),
        assignee: Option.getOrUndefined(config.assignee),
        project: Option.getOrUndefined(config.project),
        parent: Option.getOrUndefined(config.parent),
        priority,
      }
      const options: IssueUpdateOptions = {
        ...fields,
        body: Option.getOrUndefined(body),
        ...(config.append ? { append: true } : {}),
      }
      if (
        Option.isNone(sections) &&
        Object.values(fields).every((value) => value === undefined) &&
        Option.isNone(body) &&
        Option.isNone(comment)
      ) {
        return yield* errorLine(
          "validation",
          "Pass at least one of --title, --body, --state, --assignee, --project, --parent, --priority, --comment or --sections-file.",
        )
      }
      const api = yield* IssueWriteApi
      const writeOptions = { ifUnchanged: Option.getOrUndefined(config.ifUnchanged) }
      if (Option.isSome(sections)) {
        return yield* runSectionsUpdate(
          api,
          json,
          config.ref,
          fields,
          sections.value,
          writeOptions,
          comment,
          config.dryRun,
        )
      }
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
      command: "rata issue update RAT-42 --sections-file - --dry-run",
      description: "Preview several section replacements as one diff",
    },
    {
      command: 'rata issue update RAT-42 --state Done --comment "Shipped in PR #12."',
      description: "Change the state and post the comment in one call",
    },
  ]),
  withAgentNotes,
)

export { updateCommand }
