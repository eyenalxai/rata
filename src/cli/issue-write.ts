import { Effect, Option } from "effect"
import { Argument, Command, Flag } from "effect/cli"

import type { IssueCreatePlan } from "@/api/issue-write/model"
import type { WriteVisibility } from "@/api/issue-write/write-types"
import type { PlanAction } from "@/cli/output"

import { IssueWriteApi } from "@/api/issue-write"
import { resolveBody } from "@/cli/body"
import { OutputFields, rejectFields } from "@/cli/fields"
import {
  JsonOutput,
  dryRunFlag,
  errorLine,
  reportFailure,
  warningLine,
  writeDryRun,
  writeJson,
  writeLine,
} from "@/cli/output"
import { resolvePriority } from "@/cli/priority"
import { toPriority } from "@/domain/priority"

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

const createAction = (plan: IssueCreatePlan): PlanAction => ({
  action: "create",
  target: "new",
  changes: {
    team: plan.team,
    title: plan.title,
    labels: plan.labels,
    assignee: plan.assignee,
    priority: plan.priority === null ? null : toPriority(plan.priority),
  },
})

const describeCreate = (plan: IssueCreatePlan): string => {
  const details: string[] = []
  if (plan.labels.length > 0) {
    details.push(`labels ${plan.labels.join(", ")}`)
  }
  if (plan.assignee !== null) {
    details.push(`assignee ${plan.assignee}`)
  }
  if (plan.priority !== null) {
    details.push(`priority ${toPriority(plan.priority)}`)
  }
  const suffix = details.length === 0 ? "" : ` with ${details.join(", ")}`
  return `Would create "${plan.title}" in ${plan.team}${suffix}.`
}

const createCommand = Command.make(
  "create",
  {
    title: Flag.String("title").pipe(Flag.withDescription("Issue title")),
    body: bodyFlag,
    bodyFile: bodyFileFlag,
    team: optionalText("team", "Team key or id. Defaults to the team from `rata link`"),
    label: Flag.atLeast(Flag.String("label"), 0).pipe(
      Flag.withDescription("Label name. Repeat for more labels"),
    ),
    noDefaultLabels: Flag.Boolean("no-default-labels").pipe(
      Flag.withDescription("Ignore the repository default labels"),
      Flag.withDefault(false),
    ),
    parent: optionalText("parent", "Parent issue reference"),
    project: optionalText("project", "Project id or name"),
    state: optionalText("state", "Workflow state name"),
    assignee: optionalText("assignee", "Assignee: `me`, a user id, or `none`"),
    priority: optionalText("priority", "Priority: none, urgent, high, medium, low, or 0-4"),
    wait: waitFlag,
    dryRun: dryRunFlag,
  },
  (config) =>
    Effect.gen(function* createIssue() {
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
      const options = {
        title: config.title,
        body: Option.getOrUndefined(body),
        team: Option.getOrUndefined(config.team),
        labels: config.label.length > 0 ? config.label : undefined,
        parent: Option.getOrUndefined(config.parent),
        project: Option.getOrUndefined(config.project),
        state: Option.getOrUndefined(config.state),
        assignee: Option.getOrUndefined(config.assignee),
        priority: Option.getOrUndefined(yield* resolvePriority(config.priority)),
        useDefaultLabels: !config.noDefaultLabels,
        waitSeconds,
      }
      const api = yield* IssueWriteApi
      if (config.dryRun) {
        const plan = yield* api.planCreate(options)
        return yield* writeDryRun(json, [createAction(plan)], () => describeCreate(plan))
      }
      const result = yield* api.create(options)
      if (json) {
        return yield* writeJson({ issue: result.issue, visible: result.visible })
      }
      yield* writeLine(`Created ${result.issue.identifier}: ${result.issue.title}`)
      return yield* warnWhenInvisible(
        result.visible,
        `${result.issue.identifier} is not visible on the parent yet. Linear may catch up later.`,
      )
    }).pipe(Effect.catch(reportFailure)),
).pipe(
  Command.withDescription("Create an issue"),
  Command.withExamples([
    {
      command: 'rata issue create --title "Fix login" --team RAT --label ready-for-agent',
      description: "Create an issue with a label",
    },
    {
      command: 'echo "The body" | rata issue create --title "Fix login" --team RAT --body-file -',
      description: "Read the body from standard input",
    },
  ]),
)

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
      const priority = Option.getOrUndefined(yield* resolvePriority(config.priority))
      const options = {
        title: Option.getOrUndefined(config.title),
        body: Option.getOrUndefined(body),
        state: Option.getOrUndefined(config.state),
        assignee: Option.getOrUndefined(config.assignee),
        project: Option.getOrUndefined(config.project),
        parent: Option.getOrUndefined(config.parent),
        priority,
      }
      if (Object.values(options).every((value) => value === undefined)) {
        return yield* errorLine(
          1,
          "Pass at least one of --title, --body, --state, --assignee, --project, --parent or --priority.",
        )
      }
      const api = yield* IssueWriteApi
      const issue = yield* api.update(config.ref, options)
      if (json) {
        return yield* writeJson({ issue })
      }
      return yield* writeLine(`Updated ${issue.identifier}.`)
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
  ]),
)

export { commentCommand, createCommand, updateCommand }
