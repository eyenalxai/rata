import { Schema } from "effect"

import { PageInfo } from "@/api/pagination"

const IssueState = Schema.Struct({
  name: Schema.String,
  type: Schema.String,
})
type IssueState = typeof IssueState.Type

const IssueUser = Schema.Struct({
  id: Schema.String,
  name: Schema.String,
  displayName: Schema.String,
})
type IssueUser = typeof IssueUser.Type

const IssueLabel = Schema.Struct({
  id: Schema.String,
  name: Schema.String,
})
type IssueLabel = typeof IssueLabel.Type

const IssueProject = Schema.Struct({
  id: Schema.String,
  name: Schema.String,
})
type IssueProject = typeof IssueProject.Type

const IssueParent = Schema.Struct({
  id: Schema.String,
  identifier: Schema.String,
  title: Schema.String,
})
type IssueParent = typeof IssueParent.Type

const IssueTeam = Schema.Struct({
  id: Schema.String,
  key: Schema.String,
  name: Schema.String,
})
type IssueTeam = typeof IssueTeam.Type

const IssueChild = Schema.Struct({
  id: Schema.String,
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

const IssueChildConnection = Schema.Struct({
  nodes: Schema.Array(IssueChild),
  pageInfo: PageInfo,
})

const IssueRelation = Schema.Struct({
  id: Schema.String,
  type: Schema.String,
  relatedIssue: IssueChild,
})
type IssueRelation = typeof IssueRelation.Type

const IssueInverseRelation = Schema.Struct({
  id: Schema.String,
  type: Schema.String,
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

const IssueComment = Schema.Struct({
  id: Schema.String,
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
  id: Schema.String,
  identifier: Schema.String,
  title: Schema.String,
  url: Schema.String,
  state: IssueState,
  priority: Schema.Finite,
  assignee: Schema.NullOr(IssueUser),
  project: Schema.NullOr(IssueProject),
  parent: Schema.NullOr(IssueParent),
  labels: IssueLabelNodes,
})
type IssueSummaryNode = typeof IssueSummaryNode.Type

const IssueDetailNode = Schema.Struct({
  id: Schema.String,
  identifier: Schema.String,
  title: Schema.String,
  description: Schema.NullOr(Schema.String),
  url: Schema.String,
  state: IssueState,
  priority: Schema.Finite,
  assignee: Schema.NullOr(IssueUser),
  project: Schema.NullOr(IssueProject),
  parent: Schema.NullOr(IssueParent),
  team: IssueTeam,
  labels: IssueLabelConnection,
  children: IssueChildConnection,
  relations: IssueRelationConnection,
  inverseRelations: IssueInverseRelationConnection,
})
type IssueDetailNode = typeof IssueDetailNode.Type

const ListResponse = Schema.Struct({
  issues: Schema.Struct({ nodes: Schema.Array(IssueSummaryNode), pageInfo: PageInfo }),
})

const SearchResponse = Schema.Struct({
  searchIssues: Schema.Struct({ nodes: Schema.Array(IssueSummaryNode), pageInfo: PageInfo }),
})

const ShowResponse = Schema.Struct({ issue: IssueDetailNode })

const IssueIdResponse = Schema.Struct({ issue: Schema.Struct({ id: Schema.String }) })

const ChildrenResponse = Schema.Struct({
  issue: Schema.Struct({ children: IssueChildConnection }),
})

const LabelsResponse = Schema.Struct({
  issue: Schema.Struct({ labels: IssueLabelConnection }),
})

const RelationsResponse = Schema.Struct({
  issue: Schema.Struct({ relations: IssueRelationConnection }),
})

const InverseRelationsResponse = Schema.Struct({
  issue: Schema.Struct({ inverseRelations: IssueInverseRelationConnection }),
})

const CommentsResponse = Schema.Struct({
  issue: Schema.Struct({ comments: IssueCommentConnection }),
})

const WorkflowState = Schema.Struct({
  id: Schema.String,
  name: Schema.String,
  type: Schema.String,
})
type WorkflowState = typeof WorkflowState.Type

const WorkflowStateConnection = Schema.Struct({
  nodes: Schema.Array(WorkflowState),
  pageInfo: PageInfo,
})

const TeamStatesResponse = Schema.Struct({
  team: Schema.Struct({ states: WorkflowStateConnection }),
})

const IssueStatesResponse = Schema.Struct({
  issue: Schema.Struct({
    team: Schema.Struct({ id: Schema.String, states: WorkflowStateConnection }),
  }),
})

const IssueTeamResponse = Schema.Struct({
  issue: Schema.Struct({ team: Schema.Struct({ id: Schema.String }) }),
})

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

const RelationPayload = Schema.Struct({ success: Schema.Boolean })

const CreateRelationResponse = Schema.Struct({ issueRelationCreate: RelationPayload })

const DeleteRelationResponse = Schema.Struct({ issueRelationDelete: RelationPayload })

export {
  AddLabelResponse,
  ChildrenResponse,
  CommentsResponse,
  CreateCommentResponse,
  CreateIssueResponse,
  CreateRelationResponse,
  DeleteRelationResponse,
  InverseRelationsResponse,
  type IssueChild,
  type IssueComment,
  IssueIdResponse,
  type IssueInverseRelation,
  type IssueLabel,
  type IssueParent,
  type IssueProject,
  type IssueRelation,
  type IssueState,
  IssueStatesResponse,
  type IssueSummaryNode,
  type IssueTeam,
  IssueTeamResponse,
  type IssueUser,
  LabelsResponse,
  ListResponse,
  RelationsResponse,
  RemoveLabelResponse,
  SearchResponse,
  ShowResponse,
  TeamStatesResponse,
  UpdateIssueResponse,
  type WorkflowState,
}
