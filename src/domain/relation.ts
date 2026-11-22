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

export {
  type RelationKind,
  type RelationKindInfo,
  relationKindInfo,
  type RelationType,
  RelationTypeSchema,
}
