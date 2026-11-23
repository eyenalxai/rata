import { Schema } from "effect"

const applySectionModes = ["replace", "append"] as const
type ApplySectionMode = (typeof applySectionModes)[number]

const ApplySectionSchema = Schema.Struct({
  heading: Schema.String,
  mode: Schema.Literals(applySectionModes),
  content: Schema.String,
})
type ApplySection = typeof ApplySectionSchema.Type

const ApplyLabelsSchema = Schema.Struct({
  add: Schema.optional(Schema.Array(Schema.String)),
  remove: Schema.optional(Schema.Array(Schema.String)),
})
type ApplyLabels = typeof ApplyLabelsSchema.Type

const ApplyCommentSchema = Schema.Struct({
  body: Schema.String,
  dedupeKey: Schema.optional(Schema.String),
})
type ApplyComment = typeof ApplyCommentSchema.Type

const ApplyRelationsSchema = Schema.Struct({
  blockedBy: Schema.optional(Schema.Array(Schema.String)),
  blocks: Schema.optional(Schema.Array(Schema.String)),
  related: Schema.optional(Schema.Array(Schema.String)),
  duplicate: Schema.optional(Schema.Array(Schema.String)),
})
type ApplyRelations = typeof ApplyRelationsSchema.Type

const ApplyDocumentSchema = Schema.Struct({
  title: Schema.optional(Schema.String),
  state: Schema.optional(Schema.String),
  assignee: Schema.optional(Schema.NullOr(Schema.String)),
  priority: Schema.optional(Schema.String),
  project: Schema.optional(Schema.NullOr(Schema.String)),
  parent: Schema.optional(Schema.NullOr(Schema.String)),
  labels: Schema.optional(ApplyLabelsSchema),
  sections: Schema.optional(Schema.Array(ApplySectionSchema)),
  comment: Schema.optional(ApplyCommentSchema),
  relations: Schema.optional(ApplyRelationsSchema),
})
type ApplyDocument = typeof ApplyDocumentSchema.Type

const ApplyDocumentJson = Schema.fromJsonString(ApplyDocumentSchema)

const HandoffDocumentSchema = Schema.Struct({
  ...ApplyDocumentSchema.fields,
  pr: Schema.String,
})
type HandoffDocument = typeof HandoffDocumentSchema.Type

const HandoffDocumentJson = Schema.fromJsonString(HandoffDocumentSchema)

export {
  type ApplyComment,
  type ApplyDocument,
  ApplyDocumentJson,
  ApplyDocumentSchema,
  type ApplyLabels,
  type ApplyRelations,
  type ApplySection,
  type ApplySectionMode,
  applySectionModes,
  type HandoffDocument,
  HandoffDocumentJson,
  HandoffDocumentSchema,
}
