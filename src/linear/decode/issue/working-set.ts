import { Schema } from "effect"

import {
  IssueAttachmentConnection,
  IssueCommentConnection,
  IssueInverseRelationConnection,
  IssueRelationConnection,
  IssueSummaryNode,
} from "@/linear/decode/issue"
import { PageInfo } from "@/linear/decode/page"

const IssueWorkingChildNode = Schema.Struct(IssueSummaryNode.fields)
type IssueWorkingChildNode = typeof IssueWorkingChildNode.Type

const IssueWorkingChildConnection = Schema.Struct({
  nodes: Schema.Array(IssueWorkingChildNode),
  pageInfo: PageInfo,
})

const IssueWorkingNode = Schema.Struct({
  ...IssueSummaryNode.fields,
  description: Schema.optional(Schema.NullOr(Schema.String)),
  children: Schema.optional(IssueWorkingChildConnection),
  relations: Schema.optional(IssueRelationConnection),
  inverseRelations: Schema.optional(IssueInverseRelationConnection),
  attachments: Schema.optional(IssueAttachmentConnection),
  comments: Schema.optional(IssueCommentConnection),
})
type IssueWorkingNode = typeof IssueWorkingNode.Type

const WorkingSetResponse = Schema.Struct({
  issues: Schema.Struct({
    nodes: Schema.Array(IssueWorkingNode),
    pageInfo: PageInfo,
  }),
})

const WorkingSummaryResponse = Schema.Struct({
  issues: Schema.Struct({
    nodes: Schema.Array(IssueSummaryNode),
    pageInfo: PageInfo,
  }),
})

const WorkingAttachmentsPageResponse = Schema.Record(
  Schema.String,
  Schema.Struct({ attachments: IssueAttachmentConnection }),
)

const WorkingCommentsPageResponse = Schema.Record(
  Schema.String,
  Schema.Struct({ comments: IssueCommentConnection }),
)

export {
  IssueWorkingChildConnection,
  type IssueWorkingChildNode,
  IssueWorkingNode,
  WorkingAttachmentsPageResponse,
  WorkingCommentsPageResponse,
  WorkingSetResponse,
  WorkingSummaryResponse,
}
