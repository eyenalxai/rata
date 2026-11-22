import { Schema } from "effect"

import {
  IssueAttachmentConnection,
  IssueCommentConnection,
  IssueInverseRelationConnection,
  IssueLabelConnection,
  IssueRelationConnection,
  IssueSummaryNode,
} from "@/linear/decode/issue"
import { PageInfo } from "@/linear/decode/page"

const IssueWorkingChildNode = Schema.Struct({
  id: IssueSummaryNode.fields.id,
  identifier: IssueSummaryNode.fields.identifier,
  title: IssueSummaryNode.fields.title,
  state: IssueSummaryNode.fields.state,
  priority: IssueSummaryNode.fields.priority,
  createdAt: IssueSummaryNode.fields.createdAt,
  assignee: IssueSummaryNode.fields.assignee,
  inverseRelations: IssueInverseRelationConnection,
})
type IssueWorkingChildNode = typeof IssueWorkingChildNode.Type

const IssueWorkingChildConnection = Schema.Struct({
  nodes: Schema.Array(IssueWorkingChildNode),
  pageInfo: PageInfo,
})

const IssueWorkingChildFullNode = Schema.Struct({
  ...IssueSummaryNode.fields,
  labels: IssueLabelConnection,
  inverseRelations: IssueInverseRelationConnection,
})
type IssueWorkingChildFullNode = typeof IssueWorkingChildFullNode.Type

const IssueWorkingChildFullConnection = Schema.Struct({
  nodes: Schema.Array(IssueWorkingChildFullNode),
  pageInfo: PageInfo,
})

const IssueWorkingNode = Schema.Struct({
  ...IssueSummaryNode.fields,
  labels: IssueLabelConnection,
  description: Schema.NullOr(Schema.String),
  children: IssueWorkingChildConnection,
  relations: IssueRelationConnection,
  inverseRelations: IssueInverseRelationConnection,
  attachments: IssueAttachmentConnection,
  comments: Schema.optional(IssueCommentConnection),
})
type IssueWorkingNode = typeof IssueWorkingNode.Type

const IssueFullWorkingNode = Schema.Struct({
  ...IssueSummaryNode.fields,
  labels: IssueLabelConnection,
  description: Schema.NullOr(Schema.String),
  children: IssueWorkingChildFullConnection,
  relations: IssueRelationConnection,
  inverseRelations: IssueInverseRelationConnection,
  attachments: IssueAttachmentConnection,
  comments: Schema.optional(IssueCommentConnection),
})
type IssueFullWorkingNode = typeof IssueFullWorkingNode.Type

const WorkingSetResponse = Schema.Struct({
  issues: Schema.Struct({
    nodes: Schema.Array(IssueWorkingNode),
    pageInfo: PageInfo,
  }),
})

const FullWorkingSetResponse = Schema.Struct({
  issues: Schema.Struct({
    nodes: Schema.Array(IssueFullWorkingNode),
    pageInfo: PageInfo,
  }),
})

const WorkingSummaryNode = Schema.Struct({
  ...IssueSummaryNode.fields,
  labels: IssueLabelConnection,
})
type WorkingSummaryNode = typeof WorkingSummaryNode.Type

const WorkingSummaryResponse = Schema.Struct({
  issues: Schema.Struct({
    nodes: Schema.Array(WorkingSummaryNode),
    pageInfo: PageInfo,
  }),
})

const WorkingLabelsPageResponse = Schema.Record(
  Schema.String,
  Schema.Struct({ labels: IssueLabelConnection }),
)

const WorkingRelationsPageResponse = Schema.Record(
  Schema.String,
  Schema.Struct({ relations: IssueRelationConnection }),
)

const WorkingInverseRelationsPageResponse = Schema.Record(
  Schema.String,
  Schema.Struct({ inverseRelations: IssueInverseRelationConnection }),
)

const WorkingChildrenPageResponse = Schema.Record(
  Schema.String,
  Schema.Struct({ children: IssueWorkingChildConnection }),
)

const WorkingFullChildrenPageResponse = Schema.Record(
  Schema.String,
  Schema.Struct({ children: IssueWorkingChildFullConnection }),
)

const WorkingAttachmentsPageResponse = Schema.Record(
  Schema.String,
  Schema.Struct({ attachments: IssueAttachmentConnection }),
)

const WorkingCommentsPageResponse = Schema.Record(
  Schema.String,
  Schema.Struct({ comments: IssueCommentConnection }),
)

export {
  type IssueFullWorkingNode,
  type IssueWorkingChildFullNode,
  IssueWorkingChildFullConnection,
  type IssueWorkingChildNode,
  IssueWorkingChildConnection,
  IssueWorkingNode,
  FullWorkingSetResponse,
  WorkingAttachmentsPageResponse,
  WorkingChildrenPageResponse,
  WorkingCommentsPageResponse,
  WorkingFullChildrenPageResponse,
  WorkingInverseRelationsPageResponse,
  WorkingLabelsPageResponse,
  WorkingRelationsPageResponse,
  WorkingSetResponse,
  type WorkingSummaryNode,
  WorkingSummaryResponse,
}
