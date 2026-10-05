import { Schema } from "effect"

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

const PageInfo = Schema.Struct({
  hasNextPage: Schema.Boolean,
  endCursor: Schema.NullOr(Schema.String),
})
type PageInfo = typeof PageInfo.Type

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
  type: Schema.String,
  relatedIssue: IssueChild,
})
type IssueRelation = typeof IssueRelation.Type

const IssueInverseRelation = Schema.Struct({
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

export {
  ChildrenResponse,
  CommentsResponse,
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
  type IssueSummaryNode,
  type IssueTeam,
  type IssueUser,
  LabelsResponse,
  ListResponse,
  type PageInfo,
  RelationsResponse,
  SearchResponse,
  ShowResponse,
}
