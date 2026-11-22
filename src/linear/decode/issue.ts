import { Schema } from "effect"

import {
  AttachmentId,
  CommentId,
  IssueId,
  ProjectId,
  RelationId,
  TeamId,
  UserId,
} from "@/domain/id"
import { LabelValue } from "@/domain/label"
import { PriorityFromValue } from "@/domain/priority"
import { RelationTypeSchema } from "@/domain/relation"
import { WorkflowState as WorkflowStateSchema, WorkflowStateNode } from "@/domain/workflow-state"
import { PageInfo } from "@/linear/decode/page"

const IssueState = WorkflowStateSchema
type IssueState = typeof IssueState.Type

const IssueUser = Schema.Struct({
  id: UserId,
  name: Schema.String,
  displayName: Schema.String,
})
type IssueUser = typeof IssueUser.Type

const IssueLabel = LabelValue
type IssueLabel = typeof IssueLabel.Type

const IssueProject = Schema.Struct({
  id: ProjectId,
  name: Schema.String,
})
type IssueProject = typeof IssueProject.Type

const IssueParent = Schema.Struct({
  id: IssueId,
  identifier: Schema.String,
  title: Schema.String,
})
type IssueParent = typeof IssueParent.Type

const IssueTeam = Schema.Struct({
  id: TeamId,
  key: Schema.String,
  name: Schema.String,
})
type IssueTeam = typeof IssueTeam.Type

const IssueChild = Schema.Struct({
  id: IssueId,
  identifier: Schema.String,
  title: Schema.String,
  state: IssueState,
})
type IssueChild = typeof IssueChild.Type

const IssueLabelNodes = Schema.Struct({ nodes: Schema.Array(IssueLabel) })

const IssueLabelConnection = Schema.Struct({
  nodes: Schema.Array(IssueLabel),
  pageInfo: PageInfo,
})

const IssueRelation = Schema.Struct({
  id: RelationId,
  type: RelationTypeSchema,
  relatedIssue: IssueChild,
})
type IssueRelation = typeof IssueRelation.Type

const IssueInverseRelation = Schema.Struct({
  id: RelationId,
  type: RelationTypeSchema,
  issue: IssueChild,
})
type IssueInverseRelation = typeof IssueInverseRelation.Type

const IssueRelationConnection = Schema.Struct({
  nodes: Schema.Array(IssueRelation),
  pageInfo: PageInfo,
})

const IssueInverseRelationConnection = Schema.Struct({
  nodes: Schema.Array(IssueInverseRelation),
  pageInfo: PageInfo,
})

const IssueAttachment = Schema.Struct({
  id: AttachmentId,
  title: Schema.String,
  subtitle: Schema.NullOr(Schema.String),
  url: Schema.String,
  sourceType: Schema.NullOr(Schema.String),
  createdAt: Schema.String,
  metadata: Schema.optional(Schema.Record(Schema.String, Schema.Unknown)),
})
type IssueAttachment = typeof IssueAttachment.Type
const IssueAttachmentConnection = Schema.Struct({
  nodes: Schema.Array(IssueAttachment),
  pageInfo: PageInfo,
})
const IssueComment = Schema.Struct({
  id: CommentId,
  body: Schema.String,
  createdAt: Schema.String,
  user: Schema.NullOr(IssueUser),
})
type IssueComment = typeof IssueComment.Type
const IssueCommentConnection = Schema.Struct({
  nodes: Schema.Array(IssueComment),
  pageInfo: PageInfo,
})

const IssueSummaryNode = Schema.Struct({
  id: IssueId,
  identifier: Schema.String,
  title: Schema.String,
  url: Schema.String,
  state: IssueState,
  priority: PriorityFromValue,
  createdAt: Schema.String,
  updatedAt: Schema.String,
  assignee: Schema.NullOr(IssueUser),
  project: Schema.NullOr(IssueProject),
  parent: Schema.NullOr(IssueParent),
  labels: IssueLabelNodes,
  relations: Schema.optional(IssueRelationConnection),
  inverseRelations: Schema.optional(IssueInverseRelationConnection),
})
type IssueSummaryNode = typeof IssueSummaryNode.Type

const BulkTargetNode = Schema.Struct({
  ...IssueSummaryNode.fields,
  team: Schema.Struct({ id: TeamId }),
})

const IssueIdResponse = Schema.Struct({ issue: Schema.Struct({ id: IssueId }) })

const IssueSummaryResponse = Schema.Struct({ issue: IssueSummaryNode })

const IssueTeamResponse = Schema.Struct({
  issue: Schema.Struct({ team: Schema.Struct({ id: TeamId }) }),
})

const BulkTargetsResponse = Schema.Struct({
  issue: Schema.Struct({
    children: Schema.Struct({
      nodes: Schema.Array(BulkTargetNode),
      pageInfo: PageInfo,
    }),
  }),
})

const LabelsResponse = Schema.Struct({
  issue: Schema.Struct({ labels: IssueLabelConnection }),
})

const CommentsResponse = Schema.Struct({
  issue: Schema.Struct({ comments: IssueCommentConnection }),
})
const CommentByIdResponse = Schema.Struct({ comments: IssueCommentConnection })

const AttachmentsResponse = Schema.Struct({
  issue: Schema.Struct({ attachments: IssueAttachmentConnection }),
})

const WorkflowState = WorkflowStateNode
type WorkflowState = typeof WorkflowState.Type

const IssueMutationPayload = Schema.Struct({
  success: Schema.Boolean,
  issue: Schema.NullOr(IssueSummaryNode),
})

const CommentMutationPayload = Schema.Struct({
  success: Schema.Boolean,
  comment: Schema.NullOr(IssueComment),
})

const CreateIssueResponse = Schema.Struct({ issueCreate: IssueMutationPayload })

const UpdateIssueResponse = Schema.Struct({ issueUpdate: IssueMutationPayload })

const AddLabelResponse = Schema.Struct({ issueAddLabel: IssueMutationPayload })

const RemoveLabelResponse = Schema.Struct({ issueRemoveLabel: IssueMutationPayload })

const CreateCommentResponse = Schema.Struct({ commentCreate: CommentMutationPayload })
const UpdateCommentResponse = Schema.Struct({ commentUpdate: CommentMutationPayload })
const DeleteCommentResponse = Schema.Struct({
  commentDelete: Schema.Struct({ success: Schema.Boolean, entityId: Schema.String }),
})

const RelationPayload = Schema.Struct({ success: Schema.Boolean })

const CreateRelationResponse = Schema.Struct({ issueRelationCreate: RelationPayload })

const DeleteRelationResponse = Schema.Struct({ issueRelationDelete: RelationPayload })

export {
  AddLabelResponse,
  AttachmentsResponse,
  BulkTargetsResponse,
  CommentByIdResponse,
  CommentsResponse,
  CreateCommentResponse,
  CreateIssueResponse,
  CreateRelationResponse,
  DeleteCommentResponse,
  DeleteRelationResponse,
  IssueAttachmentConnection,
  type IssueAttachment,
  type IssueChild,
  type IssueComment,
  IssueCommentConnection,
  IssueIdResponse,
  type IssueInverseRelation,
  IssueInverseRelationConnection,
  type IssueLabel,
  type IssueParent,
  type IssueProject,
  type IssueRelation,
  IssueRelationConnection,
  type IssueState,
  IssueSummaryNode,
  IssueSummaryResponse,
  IssueTeamResponse,
  type IssueTeam,
  type IssueUser,
  LabelsResponse,
  RemoveLabelResponse,
  UpdateCommentResponse,
  UpdateIssueResponse,
  type WorkflowState,
}
