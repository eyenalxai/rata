import { Effect, Result } from "effect"

import type { TrackerError } from "@/domain/error"
import type { IssueWorkingSetFull } from "@/tracker/model"

import { ConflictError } from "@/domain/conflict"

const applyCommands = ["apply", "relate", "comment", "start", "handoff", "close"] as const
type ApplyCommand = (typeof applyCommands)[number]

const applyStepNames = [
  "update-fields",
  "add-label",
  "remove-label",
  "update-sections",
  "comment-create",
  "relation-add",
  "relation-remove",
  "pr-attach",
] as const
type ApplyStepName = (typeof applyStepNames)[number]

const plannedActionNames = [
  "update-fields",
  "add-label",
  "remove-label",
  "section-replace",
  "section-append",
  "comment-create",
  "relation-add",
  "relation-remove",
  "pr-attach",
] as const
type PlannedActionName = (typeof plannedActionNames)[number]

type PlannedStatus = "updated" | "skipped"
type ApplyStatus = PlannedStatus | "failed"

type PlannedAction = {
  readonly action: PlannedActionName
  readonly target: string
  readonly status: PlannedStatus
  readonly changes: Readonly<Record<string, unknown>>
}

type FailedAction = {
  readonly action: ApplyStepName
  readonly target: string
  readonly status: "failed"
  readonly changes: Readonly<Record<string, unknown>>
}

type PlanStep = {
  readonly action: ApplyStepName
  readonly target: string
  readonly status: PlannedStatus
  readonly changes: Readonly<Record<string, unknown>>
  readonly changed: readonly string[]
  readonly actions: readonly PlannedAction[]
  readonly execute: Effect.Effect<void, TrackerError>
}

type ApplyPlan = {
  readonly action: ApplyCommand
  readonly identifier: string
  readonly snapshot: string
  readonly issue: IssueWorkingSetFull
  readonly steps: readonly PlanStep[]
}

type ApplyResult = {
  readonly action: ApplyCommand
  readonly status: ApplyStatus
  readonly changed: readonly string[]
  readonly dryRun: boolean
  readonly snapshot: string
  readonly actions: readonly PlannedAction[]
  readonly failed?: FailedAction | undefined
  readonly cause?: TrackerError | undefined
}

type ApplyOptions = {
  readonly ifUnchanged?: string | undefined
}

const stepStatus = (actions: readonly PlannedAction[]): PlannedStatus =>
  actions.some((action) => action.status === "updated") ? "updated" : "skipped"

const changedOf = (
  actions: readonly PlannedAction[],
  changed: readonly string[],
): readonly string[] => (actions.some((action) => action.status === "updated") ? changed : [])

const planStatus = (steps: readonly PlanStep[]): PlannedStatus =>
  steps.some((step) => step.status === "updated") ? "updated" : "skipped"

const checkSnapshot = (
  plan: ApplyPlan,
  ifUnchanged?: string,
): Effect.Effect<void, ConflictError> =>
  ifUnchanged === undefined || ifUnchanged === plan.snapshot
    ? Effect.void
    : Effect.fail(
        new ConflictError({
          expected: ifUnchanged,
          current: plan.snapshot,
          message: `${plan.identifier} changed since you read it.`,
        }),
      )

const dryRunPlan = (plan: ApplyPlan): ApplyResult => ({
  action: plan.action,
  status: planStatus(plan.steps),
  changed: plan.steps.flatMap((step) => (step.status === "updated" ? step.changed : [])),
  dryRun: true,
  snapshot: plan.snapshot,
  actions: plan.steps.flatMap((step) => step.actions),
})

const applyPlan = (
  plan: ApplyPlan,
  options: ApplyOptions = {},
): Effect.Effect<ApplyResult, ConflictError> =>
  Effect.gen(function* applyIssuePlan() {
    yield* checkSnapshot(plan, options.ifUnchanged)
    const actions: PlannedAction[] = []
    const changed: string[] = []
    for (const step of plan.steps) {
      if (step.status === "skipped") {
        actions.push(...step.actions)
        continue
      }
      const outcome = yield* Effect.result(step.execute)
      if (Result.isFailure(outcome)) {
        return {
          action: plan.action,
          status: "failed",
          changed,
          dryRun: false,
          snapshot: plan.snapshot,
          actions,
          failed: {
            action: step.action,
            target: step.target,
            status: "failed",
            changes: step.changes,
          },
          cause: outcome.failure,
        }
      }
      actions.push(...step.actions)
      changed.push(...step.changed)
    }
    return {
      action: plan.action,
      status: actions.some((action) => action.status === "updated") ? "updated" : "skipped",
      changed,
      dryRun: false,
      snapshot: plan.snapshot,
      actions,
    }
  })

export {
  type ApplyCommand,
  applyCommands,
  type ApplyOptions,
  applyPlan,
  type ApplyPlan,
  type ApplyResult,
  type ApplyStatus,
  type ApplyStepName,
  applyStepNames,
  changedOf,
  checkSnapshot,
  dryRunPlan,
  type FailedAction,
  type PlannedAction,
  type PlannedActionName,
  plannedActionNames,
  type PlannedStatus,
  type PlanStep,
  planStatus,
  stepStatus,
}
