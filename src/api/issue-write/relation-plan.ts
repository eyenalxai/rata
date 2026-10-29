import type { IssueInverseRelation, IssueRelation } from "@/api/issue-schema"
import type {
  RelationKind,
  RelationType,
  ResolvedRelationTarget,
  WriteStatus,
} from "@/api/issue-write/model"

import { relationKindInfo } from "@/api/issue-write/model"

type PlannedRelationLink = {
  readonly kind: RelationKind
  readonly target: string
  readonly targetId: string
  readonly status: WriteStatus
  readonly input: {
    readonly issueId: string
    readonly relatedIssueId: string
    readonly type: RelationType
  }
}

type PlannedRelationUnlink = {
  readonly kind: RelationKind
  readonly target: string
  readonly relationIds: readonly string[]
  readonly status: WriteStatus
}

const matchingRelationIds = (
  kind: RelationKind,
  targetId: string,
  outgoing: readonly IssueRelation[],
  incoming: readonly IssueInverseRelation[],
): readonly string[] => {
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
  issueId: string,
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
