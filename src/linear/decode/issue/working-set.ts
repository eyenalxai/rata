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
  description: Schema.NullOr(Schema.String),
  children: IssueWorkingChildConnection,
  relations: IssueRelationConnection,
  inverseRelations: IssueInverseRelationConnection,
  attachments: IssueAttachmentConnection,
  comments: Schema.optional(IssueCommentConnection),
})
type IssueWorkingNode = typeof IssueWorkingNode.Type

const WorkingSetResponse = Schema.Struct({
  issues: Schema.Struct({
    nodes: Schema.Array(IssueWorkingNode),
    pageInfo: PageInfo,
  }),
})

const WorkingChildrenResponse = Schema.Struct({
  issue: Schema.Struct({ children: IssueWorkingChildConnection }),
})

export {
  IssueWorkingChildConnection,
  type IssueWorkingChildNode,
  IssueWorkingNode,
  WorkingChildrenResponse,
  WorkingSetResponse,
}
