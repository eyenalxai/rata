import type { IssueId, RelationId } from "@/domain/id"
import type { RelationKind, RelationType } from "@/domain/relation"
import type { IssueInverseRelation, IssueRelation } from "@/linear/decode/issue"
import type { ResolvedRelationTarget, WriteStatus } from "@/tracker/write/model"

import { relationKindInfo } from "@/domain/relation"

type PlannedRelationLink = {
  readonly kind: RelationKind
  readonly target: string
  readonly targetId: IssueId
  readonly status: WriteStatus
  readonly input: {
    readonly issueId: IssueId
    readonly relatedIssueId: IssueId
    readonly type: RelationType
  }
}

type PlannedRelationUnlink = {
  readonly kind: RelationKind
  readonly target: string
  readonly relationIds: readonly RelationId[]
  readonly status: WriteStatus
}

const matchingRelationIds = (
  kind: RelationKind,
  targetId: IssueId,
  outgoing: readonly IssueRelation[],
  incoming: readonly IssueInverseRelation[],
): readonly RelationId[] => {
  if (kind === "blockedBy") {
    return incoming
      .filter((relation) => relation.type === "blocks" && relation.issue.id === targetId)
      .map((relation) => relation.id)
  }
  if (kind === "related") {
    return [
      ...outgoing
        .filter((relation) => relation.type === "related" && relation.relatedIssue.id === targetId)
        .map((relation) => relation.id),
      ...incoming
        .filter((relation) => relation.type === "related" && relation.issue.id === targetId)
        .map((relation) => relation.id),
    ]
  }
  if (kind === "duplicate") {
    return outgoing
      .filter((relation) => relation.type === "duplicate" && relation.relatedIssue.id === targetId)
      .map((relation) => relation.id)
  }
  return outgoing
    .filter((relation) => relation.type === "blocks" && relation.relatedIssue.id === targetId)
    .map((relation) => relation.id)
}

const linkRelationPlans = (
  issueId: IssueId,
  targets: readonly ResolvedRelationTarget[],
  outgoing: readonly IssueRelation[],
  incoming: readonly IssueInverseRelation[],
): readonly PlannedRelationLink[] =>
  targets.map((entry) => {
    const info = relationKindInfo[entry.kind]
    return {
      kind: entry.kind,
      target: entry.target,
      targetId: entry.targetId,
      status:
        matchingRelationIds(entry.kind, entry.targetId, outgoing, incoming).length > 0
          ? "skipped"
          : "updated",
      input: {
        issueId: info.inverse ? entry.targetId : issueId,
        relatedIssueId: info.inverse ? issueId : entry.targetId,
        type: info.type,
      },
    }
  })

const planRelationUnlinks = (
  targets: readonly ResolvedRelationTarget[],
  outgoing: readonly IssueRelation[],
  incoming: readonly IssueInverseRelation[],
): readonly PlannedRelationUnlink[] =>
  targets.map((entry) => {
    const relationIds = matchingRelationIds(entry.kind, entry.targetId, outgoing, incoming)
    return {
      kind: entry.kind,
      target: entry.target,
      relationIds,
      status: relationIds.length === 0 ? "skipped" : "updated",
    }
  })

export {
  linkRelationPlans,
  matchingRelationIds,
  type PlannedRelationLink,
  type PlannedRelationUnlink,
  planRelationUnlinks,
}
