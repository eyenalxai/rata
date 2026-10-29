import { Effect } from "effect"

import type { LinearClient } from "@/api/client"
import type {
  IssueRelationChange,
  IssueRelationChanges,
  WriteAction,
  WriteOptions,
} from "@/api/issue-write/model"
import type { makeIssueWriteResolvers } from "@/api/issue-write/resolvers"

import { createRelationMutation, deleteRelationMutation } from "@/api/issue-query"
import { CreateRelationResponse, DeleteRelationResponse } from "@/api/issue-schema"
import { combineStatus, unwrapRelation } from "@/api/issue-write/model"
import { linkRelationPlans, planRelationUnlinks } from "@/api/issue-write/relation-plan"

type RelationWriteDependencies = {
  readonly client: LinearClient["Service"]
  readonly resolvers: ReturnType<typeof makeIssueWriteResolvers>
}

const makeRelationWrites = ({ client, resolvers }: RelationWriteDependencies) => {
  const link = Effect.fn("IssueWriteApi.link")(function* link(
    ref: string,
    changes: IssueRelationChanges,
    options: WriteOptions = {},
  ) {
    const issueId = yield* resolvers.resolveIssueId(ref)
    const targets = yield* resolvers.resolveRelationTargets(changes)
    const relations = yield* resolvers.collectRelations(issueId)
    const plans = linkRelationPlans(issueId, targets, relations.outgoing, relations.incoming)
    const actions: readonly WriteAction[] = plans.map((plan) => ({
      action: "link",
      target: ref,
      status: plan.status,
      changes: { relation: plan.kind, issue: plan.target },
    }))
    const status = combineStatus(actions)
    if (options.dryRun === true) {
      return { status, changes: [], actions }
    }
    const applied: IssueRelationChange[] = []
    for (const plan of plans) {
      if (plan.status === "skipped") {
        applied.push({ action: "skipped", kind: plan.kind, target: plan.target })
        continue
      }
      yield* client
        .execute(createRelationMutation, { input: plan.input }, CreateRelationResponse)
        .pipe(Effect.flatMap((data) => unwrapRelation(data.issueRelationCreate)))
      applied.push({ action: "created", kind: plan.kind, target: plan.target })
    }
    return { status, changes: applied, actions }
  })

  const unlink = Effect.fn("IssueWriteApi.unlink")(function* unlink(
    ref: string,
    changes: IssueRelationChanges,
    options: WriteOptions = {},
  ) {
    const issueId = yield* resolvers.resolveIssueId(ref)
    const targets = yield* resolvers.resolveRelationTargets(changes)
    const relations = yield* resolvers.collectRelations(issueId)
    const plans = planRelationUnlinks(targets, relations.outgoing, relations.incoming)
    const actions: readonly WriteAction[] = plans.map((plan) => ({
      action: "unlink",
      target: ref,
      status: plan.status,
      changes: { relation: plan.kind, issue: plan.target },
    }))
    const status = combineStatus(actions)
    if (options.dryRun === true) {
      return { status, changes: [], actions }
    }
    const applied: IssueRelationChange[] = []
    for (const plan of plans) {
      if (plan.status === "skipped") {
        applied.push({ action: "skipped", kind: plan.kind, target: plan.target })
        continue
      }
      for (const relationId of plan.relationIds) {
        yield* client
          .execute(deleteRelationMutation, { id: relationId }, DeleteRelationResponse)
          .pipe(Effect.flatMap((data) => unwrapRelation(data.issueRelationDelete)))
        applied.push({ action: "deleted", kind: plan.kind, target: plan.target })
      }
    }
    return { status, changes: applied, actions }
  })

  return { link, unlink }
}

export { makeRelationWrites, type RelationWriteDependencies }
