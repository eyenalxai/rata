import { Schema } from "effect"

const ApplySection = Schema.Struct({
  heading: Schema.String,
  mode: Schema.Literals(["replace", "append"]),
  content: Schema.String,
})
type ApplySection = typeof ApplySection.Type

const ApplyLabels = Schema.Struct({
  add: Schema.optional(Schema.Array(Schema.String)),
  remove: Schema.optional(Schema.Array(Schema.String)),
})
type ApplyLabels = typeof ApplyLabels.Type

const ApplyComment = Schema.Struct({
  body: Schema.String,
  dedupeKey: Schema.optional(Schema.String),
})
type ApplyComment = typeof ApplyComment.Type

const ApplyRelations = Schema.Struct({
  blockedBy: Schema.optional(Schema.Array(Schema.String)),
  blocks: Schema.optional(Schema.Array(Schema.String)),
  related: Schema.optional(Schema.Array(Schema.String)),
  duplicate: Schema.optional(Schema.Array(Schema.String)),
})
type ApplyRelations = typeof ApplyRelations.Type

const ApplyDocument = Schema.Struct({
  title: Schema.optional(Schema.String),
  state: Schema.optional(Schema.String),
  assignee: Schema.optional(Schema.NullOr(Schema.String)),
  priority: Schema.optional(Schema.String),
  project: Schema.optional(Schema.NullOr(Schema.String)),
  parent: Schema.optional(Schema.NullOr(Schema.String)),
  labels: Schema.optional(ApplyLabels),
  sections: Schema.optional(Schema.Array(ApplySection)),
  comment: Schema.optional(ApplyComment),
  relations: Schema.optional(ApplyRelations),
})
type ApplyDocument = typeof ApplyDocument.Type

const ApplyDocumentJson = Schema.fromJsonString(ApplyDocument)

export { ApplyComment, ApplyDocument, ApplyDocumentJson, ApplyLabels, ApplyRelations, ApplySection }
