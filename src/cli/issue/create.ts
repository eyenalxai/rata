import { Effect, Option } from "effect"
import { Flag } from "effect/cli"

import type { IssueSummary } from "@/tracker/model"
import type { IssueCreatePlan } from "@/tracker/write/model"
import type { IssueCreateOptions, IssueCreateResult } from "@/tracker/write/write-types"

import { arrayField, objectField, scalarField } from "@/cli/field/shape"
import { bodyFileFlag } from "@/cli/input"
import { resolveIssueContext } from "@/cli/issue/context"
import { formatSummary } from "@/cli/issue/format"
import { issueSummaryShape } from "@/cli/issue/shape"
import { dryRunFlag } from "@/cli/output"
import { resolvePriority } from "@/cli/priority"
import { defineCommand, selectOutput } from "@/cli/spec"
import { TrackerError } from "@/domain/error"
import { IssueWriter } from "@/tracker/write"

const optionalText = (name: string, description: string) =>
  Flag.String(name).pipe(Flag.withDescription(description), Flag.optional)

const labelFlag = Flag.atLeast(Flag.String("label"), 0).pipe(
  Flag.withDescription("Label name. Repeat for more labels"),
)

const waitFlag = Flag.Int("wait").pipe(
  Flag.withDescription(
    "Seconds to wait for the write to appear on a re-read. Default 5, 0 disables",
  ),
  Flag.optional,
)

const writeActionShape = objectField({
  action: scalarField,
  target: scalarField,
  status: scalarField,
  changes: scalarField,
})

const createResultShape = objectField({
  action: scalarField,
  status: scalarField,
  changed: arrayField(scalarField),
  dryRun: scalarField,
  snapshot: scalarField,
  actions: arrayField(writeActionShape),
  visible: scalarField,
})

const createShape = objectField({
  issue: issueSummaryShape,
  result: createResultShape,
})

type CreateAction = {
  readonly action: "create"
  readonly target: "new"
  readonly status: "updated"
  readonly changes: Readonly<Record<string, unknown>>
}

type CreateResult = {
  readonly action: "create"
  readonly status: "updated"
  readonly changed: readonly string[]
  readonly dryRun: boolean
  readonly snapshot: null
  readonly actions: readonly CreateAction[]
  readonly visible: boolean | null
}

const planAction = (plan: IssueCreatePlan): CreateAction => ({
  action: "create",
  target: "new",
  status: "updated",
  changes: {
    team: plan.team,
    title: plan.title,
    labels: plan.labels,
    assignee: plan.assignee,
    priority: plan.priority,
  },
})

const issueAction = (issue: IssueSummary): CreateAction => ({
  action: "create",
  target: "new",
  status: "updated",
  changes: {
    identifier: issue.identifier,
    title: issue.title,
    state: issue.state.name,
    priority: issue.priority,
    labels: issue.labels.map((label) => label.name),
    assignee: issue.assignee?.name ?? null,
  },
})

const resultOf = (
  actions: readonly CreateAction[],
  dryRun: boolean,
  visible: boolean | null,
): CreateResult => ({
  action: "create",
  status: "updated",
  changed: ["issue"],
  dryRun,
  snapshot: null,
  actions,
  visible,
})

const resultLines = (result: CreateResult): readonly string[] => [
  `result: ${result.status}${result.dryRun ? " (dry run)" : ""}`,
  `changed: ${result.changed.join(", ")}`,
]

const describePlan = (plan: IssueCreatePlan): string => {
  const details: string[] = []
  if (plan.labels.length > 0) {
    details.push(`labels ${plan.labels.join(", ")}`)
  }
  if (plan.assignee !== null) {
    details.push(`assignee ${plan.assignee}`)
  }
  if (plan.priority !== null) {
    details.push(`priority ${plan.priority}`)
  }
  const suffix = details.length === 0 ? "" : ` with ${details.join(", ")}`
  return `Would create "${plan.title}" in ${plan.team}${suffix}.`
}

const createSpec = defineCommand("create", {
  summary: "Create an issue",
  examples: [
    {
      command: 'rata issue create --title "Fix login" --team RAT --label ready-for-agent',
      description: "Create an issue with a label",
    },
    {
      command: 'echo "The body" | rata issue create --title "Fix login" --team RAT --body-file -',
      description: "Read the body from standard input",
    },
    {
      command: 'rata issue create --title "Fix login" --team RAT --dry-run',
      description: "Print the plan and write nothing",
    },
  ],
  input: {
    title: Flag.String("title").pipe(Flag.withDescription("Issue title")),
    bodyFile: bodyFileFlag,
    team: optionalText("team", "Team key or id. Defaults to the team from `rata admin link`"),
    label: labelFlag,
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
  control: (input) => ({ dryRun: input.dryRun, bodyFile: input.bodyFile }),
  output: selectOutput(createShape),
  run: (input, control) =>
    Effect.gen(function* createIssue() {
      const waitSeconds = Option.getOrUndefined(input.wait)
      if (waitSeconds !== undefined && waitSeconds < 0) {
        return yield* new TrackerError({
          code: "validation",
          message: "The --wait flag must be 0 or more.",
          hint: null,
        })
      }
      const team = Option.getOrUndefined(input.team)
      const context = yield* resolveIssueContext({ requireTeam: true, team, viewer: false })
      const writer = yield* IssueWriter
      const options: IssueCreateOptions = {
        title: input.title,
        body: Option.getOrUndefined(control.body),
        team,
        labels: input.label.length === 0 ? undefined : input.label,
        parent: Option.getOrUndefined(input.parent),
        project: Option.getOrUndefined(input.project),
        state: Option.getOrUndefined(input.state),
        assignee: Option.getOrUndefined(input.assignee),
        priority: Option.getOrUndefined(yield* resolvePriority(input.priority)),
        useDefaultLabels: !input.noDefaultLabels,
        waitSeconds,
      }
      if (control.dryRun) {
        const plan = yield* writer.planCreate(context, options)
        const result = resultOf([planAction(plan)], true, null)
        return {
          kind: "resource",
          value: { issue: null, result },
          text: [describePlan(plan), "", ...resultLines(result)],
        }
      }
      const created: IssueCreateResult = yield* writer.create(context, options)
      const result = resultOf([issueAction(created.issue)], false, created.visible)
      return {
        kind: "resource",
        value: { issue: created.issue, result },
        text: [
          formatSummary(created.issue),
          "",
          ...resultLines(result),
          ...(created.visible === false ? ["visible: false"] : []),
        ],
      }
    }),
})

export { createSpec }
