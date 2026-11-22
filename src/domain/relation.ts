import { Schema } from "effect"

const relationTypes = ["blocks", "duplicate", "related", "similar"] as const
type RelationType = (typeof relationTypes)[number]

const RelationTypeSchema = Schema.Literals(relationTypes)

const relationKinds = ["blocks", "blockedBy", "related", "duplicate"] as const
type RelationKind = (typeof relationKinds)[number]

type RelationKindInfo = {
  readonly label: string
  readonly type: RelationType
  readonly inverse: boolean
}

const relationKindInfo: Readonly<Record<RelationKind, RelationKindInfo>> = {
  blocks: { label: "blocks", type: "blocks", inverse: false },
  blockedBy: { label: "blocked by", type: "blocks", inverse: true },
  related: { label: "related to", type: "related", inverse: false },
  duplicate: { label: "duplicates", type: "duplicate", inverse: false },
}

type OutgoingRelation<A> = {
  readonly type: RelationType
  readonly relatedIssue: A
}

type IncomingRelation<A> = {
  readonly type: RelationType
  readonly issue: A
}

type RelationTargets<A> = {
  readonly blocks: readonly A[]
  readonly blockedBy: readonly A[]
  readonly duplicates: readonly A[]
  readonly duplicatedBy: readonly A[]
  readonly related: readonly A[]
  readonly similar: readonly A[]
}

const relationTargets = <A>(
  outgoing: readonly OutgoingRelation<A>[],
  incoming: readonly IncomingRelation<A>[],
): RelationTargets<A> => ({
  blocks: outgoing
    .filter((relation) => relation.type === "blocks")
    .map((relation) => relation.relatedIssue),
  blockedBy: incoming
    .filter((relation) => relation.type === "blocks")
    .map((relation) => relation.issue),
  duplicates: outgoing
    .filter((relation) => relation.type === "duplicate")
    .map((relation) => relation.relatedIssue),
  duplicatedBy: incoming
    .filter((relation) => relation.type === "duplicate")
    .map((relation) => relation.issue),
  related: [
    ...outgoing
      .filter((relation) => relation.type === "related")
      .map((relation) => relation.relatedIssue),
    ...incoming.filter((relation) => relation.type === "related").map((relation) => relation.issue),
  ],
  similar: [
    ...outgoing
      .filter((relation) => relation.type === "similar")
      .map((relation) => relation.relatedIssue),
    ...incoming.filter((relation) => relation.type === "similar").map((relation) => relation.issue),
  ],
})

export {
  type IncomingRelation,
  type OutgoingRelation,
  type RelationKind,
  type RelationKindInfo,
  relationKindInfo,
  type RelationTargets,
  relationTargets,
  type RelationType,
  RelationTypeSchema,
}
