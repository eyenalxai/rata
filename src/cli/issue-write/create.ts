import { Effect, Option } from "effect"
import { Command, Flag } from "effect/cli"

import type { IssueCreatePlan } from "@/api/issue-write/model"
import type { PlanAction } from "@/cli/output"

import { IssueWriteApi } from "@/api/issue-write"
import { resolveBody } from "@/cli/body"
import { OutputFields, rejectFields } from "@/cli/fields"
import {
  bodyFileFlag,
  bodyFlag,
  optionalText,
  validateWait,
  waitFlag,
  warnWhenInvisible,
} from "@/cli/issue-write/flags"
import {
  JsonOutput,
  dryRunFlag,
  reportFailure,
  writeDryRun,
  writeJson,
  writeLine,
} from "@/cli/output"
import { resolvePriority } from "@/cli/priority"
import { toPriority } from "@/domain/priority"

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

export { createCommand }
