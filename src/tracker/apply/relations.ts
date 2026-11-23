import { Effect } from "effect"

import type { ApplyDocument, ApplyRelations } from "@/domain/apply"
import type { IssueId } from "@/domain/id"
import type { RelationKind } from "@/domain/relation"
import type { LinearClientShape } from "@/linear/client"
import type { ApplyPlanError, ApplyPlanOptions } from "@/tracker/apply/model"
import type { IssueWorkingSetFull } from "@/tracker/model"
import type { PlannedAction, PlanStep } from "@/tracker/plan"
import type { makeIssueWriteResolvers } from "@/tracker/write/resolvers"

import { TrackerError } from "@/domain/error"
import { relationKindInfo } from "@/domain/relation"
import { CreateRelationResponse, DeleteRelationResponse } from "@/linear/decode/issue"
import { createRelationMutation, deleteRelationMutation } from "@/tracker/write/documents"
import { unwrapRelation } from "@/tracker/write/model"
import { planRelationUnlinks } from "@/tracker/write/relation-plan"

type RelationDependencies = {
  readonly client: LinearClientShape
  readonly resolvers: ReturnType<typeof makeIssueWriteResolvers>
}

type RelationChanges = {
  readonly blocks: readonly string[]
  readonly blockedBy: readonly string[]
  readonly related: readonly string[]
  readonly duplicate: readonly string[]
}

const validationError = (message: string, hint: string | null = null) =>
  new TrackerError({ code: "validation", message, hint })

const relationGroups = (relations: ApplyRelations | undefined): RelationChanges => ({
  blocks: relations?.blocks ?? [],
  blockedBy: relations?.blockedBy ?? [],
  related: relations?.related ?? [],
  duplicate: relations?.duplicate ?? [],
})

const relationTargets = (
  changes: RelationChanges,
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

const relationStep = (
  ref: string,
  kind: RelationKind,
  target: string,
  status: "updated" | "skipped",
  execute: Effect.Effect<void, Error>,
): PlanStep => ({
  action: "relation-add",
  target: ref,
  status,
  changes: { relation: kind, issue: target },
  changed: status === "updated" ? [`relation:${kind}:${target}`] : [],
  actions: [relationAction(ref, kind, target, status)],
  execute,
})

const uniqueTargets = (
  targets: readonly {
    readonly kind: RelationKind
    readonly target: string
    readonly targetId: IssueId
  }[],
) => {
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
): Effect.Effect<readonly PlanStep[], ApplyPlanError> =>
  Effect.gen(function* planRelationAdditions() {
    const changes = relationGroups(relations)
    if (relationTargets(changes).length === 0) {
      return []
    }
    const resolved = yield* dependencies.resolvers.resolveRelations(ref, changes)
    const targets = uniqueTargets(resolved.targets)
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
    const steps: PlanStep[] = []
    for (const target of targets) {
      if (target.targetId === snapshot.id) {
        return yield* validationError("An issue cannot relate to itself.")
      }
      if (existsInSnapshot(snapshot, target.kind, target.targetId)) {
        steps.push(relationStep(ref, target.kind, target.target, "skipped", Effect.void))
        continue
      }
      const info = relationKindInfo[target.kind]
      steps.push(
        relationStep(
          ref,
          target.kind,
          target.target,
          "updated",
          dependencies.client
            .execute(
              createRelationMutation,
              {
                input: {
                  issueId: info.inverse ? target.targetId : snapshot.id,
                  relatedIssueId: info.inverse ? snapshot.id : target.targetId,
                  type: info.type,
                },
              },
              CreateRelationResponse,
            )
            .pipe(Effect.flatMap((data) => unwrapRelation(data.issueRelationCreate))),
        ),
      )
    }
    return steps
  })

const removalSteps = (
  dependencies: RelationDependencies,
  ref: string,
  snapshot: IssueWorkingSetFull,
  relations: ApplyRelations | undefined,
): Effect.Effect<readonly PlanStep[], ApplyPlanError> =>
  Effect.gen(function* planRelationRemovals() {
    const changes = relationGroups(relations)
    if (relationTargets(changes).length === 0) {
      return []
    }
    const resolved = yield* dependencies.resolvers.resolveRelations(ref, changes)
    const targets = uniqueTargets(resolved.targets)
    const current = yield* dependencies.resolvers.collectRelations(snapshot.id)
    const plans = planRelationUnlinks(targets, current.outgoing, current.incoming)
    const steps: PlanStep[] = []
    for (const plan of plans) {
      if (plan.status === "skipped" || plan.relationIds.length === 0) {
        steps.push({
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
          execute: Effect.void,
        })
        continue
      }
      for (const relationId of plan.relationIds) {
        steps.push({
          action: "relation-remove",
          target: ref,
          status: "updated",
          changes: { relation: plan.kind, issue: plan.target, relationId: String(relationId) },
          changed: [`relation:${plan.kind}:${plan.target}`],
          actions: [
            {
              action: "relation-remove",
              target: ref,
              status: "updated",
              changes: { relation: plan.kind, issue: plan.target },
            },
          ],
          execute: dependencies.client
            .execute(deleteRelationMutation, { id: relationId }, DeleteRelationResponse)
            .pipe(Effect.flatMap((data) => unwrapRelation(data.issueRelationDelete))),
        })
      }
    }
    return steps
  })

const planRelationSteps = (
  dependencies: RelationDependencies,
  ref: string,
  snapshot: IssueWorkingSetFull,
  document: ApplyDocument,
  options: ApplyPlanOptions,
): Effect.Effect<readonly PlanStep[], ApplyPlanError> =>
  options.removeRelations === true
    ? removalSteps(dependencies, ref, snapshot, document.relations)
    : additionSteps(dependencies, ref, snapshot, document.relations)

export { planRelationSteps }
