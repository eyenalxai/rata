import type { IssueId, RelationId } from "@/domain/id"
import type { RelationKind } from "@/domain/relation"
import type { IssueInverseRelation, IssueRelation } from "@/linear/decode/issue"
import type { ResolvedRelationTarget, WriteStatus } from "@/tracker/write/model"

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

export { matchingRelationIds, type PlannedRelationUnlink, planRelationUnlinks }
