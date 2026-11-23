import { Effect } from "effect"

import type { ResolvedContext } from "@/context/model"
import type { ApplyDocument } from "@/domain/apply"
import type { LabelId } from "@/domain/id"
import type { ApplyPlanError, ApplyWriter } from "@/tracker/apply/model"
import type { IssueWorkingSetFull } from "@/tracker/model"
import type { ApplyStep, PlannedAction } from "@/tracker/plan"

import { TrackerError } from "@/domain/error"

type LabelDependencies = {
  readonly writer: ApplyWriter
}

type LabelPlan = {
  readonly action: "add-label" | "remove-label"
  readonly status: "updated" | "skipped"
  readonly name: string
  readonly id: LabelId
}

const validationError = (message: string, hint: string | null = null) =>
  new TrackerError({ code: "validation", message, hint })

const uniqueResolved = (
  values: readonly { readonly id: LabelId; readonly name: string }[],
): readonly { readonly id: LabelId; readonly name: string }[] => {
  const seen = new Set<string>()
  return values.filter((value) => {
    if (seen.has(value.id)) {
      return false
    }
    seen.add(value.id)
    return true
  })
}

const planLabels = (
  dependencies: LabelDependencies,
  context: ResolvedContext,
  snapshot: IssueWorkingSetFull,
  document: ApplyDocument,
): Effect.Effect<readonly LabelPlan[], ApplyPlanError> =>
  Effect.gen(function* planIssueLabels() {
    const add = document.labels?.add ?? []
    const remove = document.labels?.remove ?? []
    if (add.length === 0 && remove.length === 0) {
      return []
    }
    const resolvedAdd =
      add.length === 0
        ? []
        : uniqueResolved(yield* dependencies.writer.resolveLabels(context, snapshot.id, add))
    const resolvedRemove =
      remove.length === 0
        ? []
        : uniqueResolved(yield* dependencies.writer.resolveLabels(context, snapshot.id, remove))
    const removed = new Set(resolvedRemove.map((label) => label.id))
    const conflict = resolvedAdd.find((label) => removed.has(label.id))
    if (conflict !== undefined) {
      return yield* validationError(
        `The label ${conflict.name} cannot be added and removed in one document.`,
        "Remove it from one list.",
      )
    }
    const current = new Set(snapshot.labels.map((label) => label.id))
    return [
      ...resolvedAdd.map((label): LabelPlan => ({
        action: "add-label",
        status: current.has(label.id) ? "skipped" : "updated",
        name: label.name,
        id: label.id,
      })),
      ...resolvedRemove.map((label): LabelPlan => ({
        action: "remove-label",
        status: current.has(label.id) ? "updated" : "skipped",
        name: label.name,
        id: label.id,
      })),
    ]
  })

const labelAction = (ref: string, plan: LabelPlan): PlannedAction => ({
  action: plan.action,
  target: ref,
  status: plan.status,
  changes: { label: plan.name },
})

const planLabelSteps = (
  dependencies: LabelDependencies,
  context: ResolvedContext,
  ref: string,
  snapshot: IssueWorkingSetFull,
  document: ApplyDocument,
): Effect.Effect<readonly ApplyStep[], ApplyPlanError> =>
  Effect.gen(function* planLabelWrites() {
    const plans = yield* planLabels(dependencies, context, snapshot, document)
    return plans.map((plan) => ({
      action: plan.action,
      target: ref,
      status: plan.status,
      changes: { label: plan.name },
      changed: [`label:${plan.action === "add-label" ? "+" : "-"}${plan.name}`],
      actions: [labelAction(ref, plan)],
      issueId: snapshot.id,
      labelId: plan.id,
    }))
  })

export { planLabelSteps }
