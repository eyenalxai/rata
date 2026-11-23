import { Effect, Result } from "effect"

import type { CommentId, IssueId, LabelId, RelationId } from "@/domain/id"
import type { RelationType } from "@/domain/relation"

import { TrackerError } from "@/domain/error"

const plannedActionNames = [
  "update-fields",
  "add-label",
  "remove-label",
  "section-replace",
  "section-append",
  "comment-create",
  "relation-add",
  "relation-remove",
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

type StepMeta = {
  readonly target: string
  readonly status: PlannedStatus
  readonly changes: Readonly<Record<string, unknown>>
  readonly changed: readonly string[]
  readonly actions: readonly PlannedAction[]
}

type ApplyStep = StepMeta &
  (
    | {
        readonly action: "update-fields"
        readonly issueId: IssueId
        readonly input: Readonly<Record<string, unknown>>
      }
    | {
        readonly action: "add-label" | "remove-label"
        readonly issueId: IssueId
        readonly labelId: LabelId
      }
    | {
        readonly action: "update-sections"
        readonly issueId: IssueId
        readonly description: string
      }
    | {
        readonly action: "comment-create"
        readonly issueId: IssueId
        readonly body: string
        readonly commentId: CommentId
      }
    | {
        readonly action: "relation-add"
        readonly input: {
          readonly issueId: IssueId
          readonly relatedIssueId: IssueId
          readonly type: RelationType
        }
      }
    | {
        readonly action: "relation-remove"
        readonly relationId?: RelationId | undefined
      }
  )

type ApplyPlan = {
  readonly identifier: string
  readonly snapshot: string
  readonly steps: readonly ApplyStep[]
}

type ApplyFailure = {
  readonly action: ApplyStep["action"]
  readonly target: string
  readonly status: "failed"
  readonly changes: Readonly<Record<string, unknown>>
  readonly error: TrackerError
}

type ApplyResult = {
  readonly status: ApplyStatus
  readonly changed: readonly string[]
  readonly dryRun: boolean
  readonly snapshot: string
  readonly actions: readonly PlannedAction[]
  readonly failed?: ApplyFailure | undefined
}

type ApplyOptions = {
  readonly ifUnchanged?: string | undefined
}

type ApplyExecutor = {
  readonly applyStep: (step: ApplyStep) => Effect.Effect<void, TrackerError>
}

const checkSnapshot = (
  plan: ApplyPlan,
  expected: string | undefined,
): Effect.Effect<void, TrackerError> =>
  expected === undefined || expected === plan.snapshot
    ? Effect.void
    : Effect.fail(
        new TrackerError({
          code: "conflict",
          message: `${plan.identifier} changed since you read it.`,
          hint: `The current updatedAt is ${plan.snapshot}. Re-read the issue and retry.`,
        }),
      )

const planStatus = (steps: readonly ApplyStep[]): PlannedStatus =>
  steps.some((step) => step.status === "updated") ? "updated" : "skipped"

const dryRunPlan = (plan: ApplyPlan): ApplyResult => ({
  status: planStatus(plan.steps),
  changed: plan.steps.flatMap((step) => (step.status === "updated" ? step.changed : [])),
  dryRun: true,
  snapshot: plan.snapshot,
  actions: plan.steps.flatMap((step) => step.actions),
})

const applyPlan = (
  executor: ApplyExecutor,
  plan: ApplyPlan,
  options: ApplyOptions = {},
): Effect.Effect<ApplyResult, TrackerError> =>
  Effect.gen(function* applyIssuePlan() {
    yield* checkSnapshot(plan, options.ifUnchanged)
    const actions: PlannedAction[] = []
    const changed: string[] = []
    for (const step of plan.steps) {
      if (step.status === "skipped") {
        actions.push(...step.actions)
        continue
      }
      const outcome = yield* Effect.result(executor.applyStep(step))
      if (Result.isFailure(outcome)) {
        return {
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
            error: outcome.failure,
          },
        }
      }
      actions.push(...step.actions)
      changed.push(...step.changed)
    }
    return {
      status: actions.some((action) => action.status === "updated") ? "updated" : "skipped",
      changed,
      dryRun: false,
      snapshot: plan.snapshot,
      actions,
    }
  })

export {
  type ApplyExecutor,
  type ApplyFailure,
  type ApplyOptions,
  applyPlan,
  type ApplyPlan,
  type ApplyResult,
  type ApplyStatus,
  type ApplyStep,
  checkSnapshot,
  dryRunPlan,
  type PlannedAction,
  type PlannedActionName,
  type PlannedStatus,
  planStatus,
  type StepMeta,
}
