import { Effect } from "effect"

import type { ApplyDocument, ApplyRelations } from "@/domain/apply"
import type { IssueId } from "@/domain/id"
import type { RelationKind } from "@/domain/relation"
import type { ApplyPlanError, ApplyPlanOptions, ApplyWriter } from "@/tracker/apply/model"
import type { IssueWorkingSetFull } from "@/tracker/model"
import type { ApplyStep, PlannedAction } from "@/tracker/plan"
import type { IssueRelationChanges } from "@/tracker/write/model"

import { TrackerError } from "@/domain/error"
import { relationKindInfo } from "@/domain/relation"
import { planRelationUnlinks } from "@/tracker/write/relation-plan"

type RelationDependencies = {
  readonly writer: ApplyWriter
}

type RelationTarget = {
  readonly kind: RelationKind
  readonly target: string
  readonly targetId: IssueId
}

const validationError = (message: string, hint: string | null = null) =>
  new TrackerError({ code: "validation", message, hint })

const relationGroups = (relations: ApplyRelations | undefined): IssueRelationChanges => ({
  blocks: relations?.blocks ?? [],
  blockedBy: relations?.blockedBy ?? [],
  related: relations?.related ?? [],
  duplicate: relations?.duplicate ?? [],
})

const relationTargets = (
  changes: IssueRelationChanges,
): readonly { readonly kind: RelationKind; readonly target: string }[] => [
  ...changes.blocks.map((target) => ({ kind: "blocks" as const, target })),
  ...changes.blockedBy.map((target) => ({ kind: "blockedBy" as const, target })),
  ...changes.related.map((target) => ({ kind: "related" as const, target })),
  ...changes.duplicate.map((target) => ({ kind: "duplicate" as const, target })),
]

const existsInSnapshot = (
  snapshot: IssueWorkingSetFull,
  kind: RelationKind,
  targetId: IssueId,
): boolean => {
  const matches = (child: { readonly id: IssueId }): boolean =>
    String(child.id) === String(targetId)
  if (kind === "blocks") {
    return snapshot.relations.blocks.some(matches)
  }
  if (kind === "blockedBy") {
    return snapshot.relations.blockedBy.some(matches)
  }
  if (kind === "duplicate") {
    return snapshot.relations.duplicates.some(matches)
  }
  return snapshot.relations.related.some(matches)
}

const relationAction = (
  ref: string,
  kind: RelationKind,
  target: string,
  status: "updated" | "skipped",
): PlannedAction => ({
  action: "relation-add",
  target: ref,
  status,
  changes: { relation: kind, issue: target },
})

const uniqueTargets = (targets: readonly RelationTarget[]): readonly RelationTarget[] => {
  const seen = new Set<string>()
  return targets.filter((target) => {
    const key = `${target.kind}:${target.targetId}`
    if (seen.has(key)) {
      return false
    }
    seen.add(key)
    return true
  })
}

const additionSteps = (
  dependencies: RelationDependencies,
  ref: string,
  snapshot: IssueWorkingSetFull,
  relations: ApplyRelations | undefined,
): Effect.Effect<readonly ApplyStep[], ApplyPlanError> =>
  Effect.gen(function* planRelationAdditions() {
    const changes = relationGroups(relations)
    if (relationTargets(changes).length === 0) {
      return []
    }
    const resolved = yield* dependencies.writer.resolveRelations(ref, changes)
    const targets = uniqueTargets(resolved)
    const blocks = new Set(
      targets.filter((target) => target.kind === "blocks").map((target) => target.targetId),
    )
    const cycle = targets.find(
      (target) => target.kind === "blockedBy" && blocks.has(target.targetId),
    )
    if (cycle !== undefined) {
      return yield* validationError(
        `The issue cannot block and be blocked by ${cycle.target} in one document.`,
        "Remove one of the two relations.",
      )
    }
    const steps: ApplyStep[] = []
    for (const target of targets) {
      if (target.targetId === snapshot.id) {
        return yield* validationError("An issue cannot relate to itself.")
      }
      if (existsInSnapshot(snapshot, target.kind, target.targetId)) {
        steps.push({
          action: "relation-add",
          target: ref,
          status: "skipped",
          changes: { relation: target.kind, issue: target.target },
          changed: [],
          actions: [relationAction(ref, target.kind, target.target, "skipped")],
          input: {
            issueId: relationKindInfo[target.kind].inverse ? target.targetId : snapshot.id,
            relatedIssueId: relationKindInfo[target.kind].inverse ? snapshot.id : target.targetId,
            type: relationKindInfo[target.kind].type,
          },
        })
        continue
      }
      const info = relationKindInfo[target.kind]
      steps.push({
        action: "relation-add",
        target: ref,
        status: "updated",
        changes: { relation: target.kind, issue: target.target },
        changed: [`relation:${target.kind}:${target.target}`],
        actions: [relationAction(ref, target.kind, target.target, "updated")],
        input: {
          issueId: info.inverse ? target.targetId : snapshot.id,
          relatedIssueId: info.inverse ? snapshot.id : target.targetId,
          type: info.type,
        },
      })
    }
    return steps
  })

const removalSteps = (
  dependencies: RelationDependencies,
  ref: string,
  snapshot: IssueWorkingSetFull,
  relations: ApplyRelations | undefined,
): Effect.Effect<readonly ApplyStep[], ApplyPlanError> =>
  Effect.gen(function* planRelationRemovals() {
    const changes = relationGroups(relations)
    if (relationTargets(changes).length === 0) {
      return []
    }
    const resolved = yield* dependencies.writer.resolveRelations(ref, changes)
    const targets = uniqueTargets(resolved)
    const current = yield* dependencies.writer.collectRelations(snapshot.id)
    const plans = planRelationUnlinks(targets, current.outgoing, current.incoming)
    return plans.flatMap((plan): readonly ApplyStep[] => {
      if (plan.status === "skipped") {
        return [
          {
            action: "relation-remove",
            target: ref,
            status: "skipped",
            changes: { relation: plan.kind, issue: plan.target },
            changed: [],
            actions: [
              {
                action: "relation-remove",
                target: ref,
                status: "skipped",
                changes: { relation: plan.kind, issue: plan.target },
              },
            ],
          },
        ]
      }
      return plan.relationIds.map((relationId) => ({
        action: "relation-remove",
        target: ref,
        status: "updated",
        changes: { relation: plan.kind, issue: plan.target, relationId },
        changed: [`relation:${plan.kind}:${plan.target}`],
        actions: [
          {
            action: "relation-remove",
            target: ref,
            status: "updated",
            changes: { relation: plan.kind, issue: plan.target, relationId },
          },
        ],
        relationId,
      }))
    })
  })

const planRelationSteps = (
  dependencies: RelationDependencies,
  ref: string,
  snapshot: IssueWorkingSetFull,
  document: ApplyDocument,
  options: ApplyPlanOptions,
): Effect.Effect<readonly ApplyStep[], ApplyPlanError> =>
  options.removeRelations === true
    ? removalSteps(dependencies, ref, snapshot, document.relations)
    : additionSteps(dependencies, ref, snapshot, document.relations)

export { planRelationSteps }
