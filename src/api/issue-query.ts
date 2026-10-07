import { pageSize } from "@/api/pagination"

const summaryFields = `
      id
      identifier
      title
      url
      state { name type }
      priority
      assignee { id name displayName }
      project { id name }
      parent { id identifier title }
      labels { nodes { id name } }`

const listQuery = `query IssueList($filter: IssueFilter, $first: Int!, $after: String) {
  issues(filter: $filter, first: $first, after: $after, orderBy: createdAt) {
    nodes {${summaryFields}
    }
    pageInfo { hasNextPage endCursor }
  }
}`

const searchQuery = `query IssueSearch($term: String!, $filter: IssueFilter, $first: Int!, $after: String) {
  searchIssues(term: $term, filter: $filter, first: $first, after: $after) {
    nodes {${summaryFields}
    }
    pageInfo { hasNextPage endCursor }
  }
}`

const showQuery = `query IssueShow($id: String!) {
  issue(id: $id) {
    id
    identifier
    title
    description
    url
    state { name type }
    priority
    assignee { id name displayName }
    project { id name }
    parent { id identifier title }
    team { id key name }
    labels(first: ${pageSize}) { nodes { id name } pageInfo { hasNextPage endCursor } }
    children(first: ${pageSize}) { nodes { id identifier title state { name type } } pageInfo { hasNextPage endCursor } }
    relations(first: ${pageSize}) { nodes { id type relatedIssue { id identifier title state { name type } } } pageInfo { hasNextPage endCursor } }
    inverseRelations(first: ${pageSize}) { nodes { id type issue { id identifier title state { name type } } } pageInfo { hasNextPage endCursor } }
  }
}`

const issueIdQuery = `query IssueId($id: String!) {
  issue(id: $id) {
    id
  }
}`

const childrenQuery = `query IssueChildren($id: String!, $first: Int!, $after: String) {
  issue(id: $id) {
    children(first: $first, after: $after) {
      nodes { id identifier title state { name type } }
      pageInfo { hasNextPage endCursor }
    }
  }
}`

const labelsQuery = `query IssueLabels($id: String!, $first: Int!, $after: String) {
  issue(id: $id) {
    labels(first: $first, after: $after) {
      nodes { id name }
      pageInfo { hasNextPage endCursor }
    }
  }
}`

const relationsQuery = `query IssueRelations($id: String!, $first: Int!, $after: String) {
  issue(id: $id) {
    relations(first: $first, after: $after) {
      nodes { id type relatedIssue { id identifier title state { name type } } }
      pageInfo { hasNextPage endCursor }
    }
  }
}`

const inverseRelationsQuery = `query IssueInverseRelations($id: String!, $first: Int!, $after: String) {
  issue(id: $id) {
    inverseRelations(first: $first, after: $after) {
      nodes { id type issue { id identifier title state { name type } } }
      pageInfo { hasNextPage endCursor }
    }
  }
}`

const commentsQuery = `query IssueComments($id: String!, $first: Int!, $after: String) {
  issue(id: $id) {
    comments(first: $first, after: $after, orderBy: createdAt) {
      nodes { id body createdAt user { id name displayName } }
      pageInfo { hasNextPage endCursor }
    }
  }
}`

const createIssueMutation = `mutation CreateIssue($input: IssueCreateInput!) {
  issueCreate(input: $input) {
    success
    issue {${summaryFields}
    }
  }
}`

const updateIssueMutation = `mutation UpdateIssue($id: String!, $input: IssueUpdateInput!) {
  issueUpdate(id: $id, input: $input) {
    success
    issue {${summaryFields}
    }
  }
}`

const createCommentMutation = `mutation CreateComment($input: CommentCreateInput!) {
  commentCreate(input: $input) {
    success
    comment { id body createdAt user { id name displayName } }
  }
}`

const addLabelMutation = `mutation AddLabel($id: String!, $labelId: String!) {
  issueAddLabel(id: $id, labelId: $labelId) {
    success
    issue {${summaryFields}
    }
  }
}`

const removeLabelMutation = `mutation RemoveLabel($id: String!, $labelId: String!) {
  issueRemoveLabel(id: $id, labelId: $labelId) {
    success
    issue {${summaryFields}
    }
  }
}`

const createRelationMutation = `mutation IssueRelationCreate($input: IssueRelationCreateInput!) {
  issueRelationCreate(input: $input) {
    success
  }
}`

const deleteRelationMutation = `mutation IssueRelationDelete($id: String!) {
  issueRelationDelete(id: $id) {
    success
  }
}`

const teamStatesQuery = `query TeamStates($teamId: String!, $first: Int!, $after: String) {
  team(id: $teamId) {
    states(first: $first, after: $after, orderBy: createdAt) {
      nodes { id name type }
      pageInfo { hasNextPage endCursor }
    }
  }
}`

const issueStatesQuery = `query IssueStates($id: String!, $first: Int!, $after: String) {
  issue(id: $id) {
    team {
      id
      states(first: $first, after: $after, orderBy: createdAt) {
        nodes { id name type }
        pageInfo { hasNextPage endCursor }
      }
    }
  }
}`

const issueTeamQuery = `query IssueTeam($id: String!) {
  issue(id: $id) {
    team {
      id
    }
  }
}`

export {
  addLabelMutation,
  childrenQuery,
  commentsQuery,
  createCommentMutation,
  createIssueMutation,
  createRelationMutation,
  deleteRelationMutation,
  inverseRelationsQuery,
  issueIdQuery,
  issueStatesQuery,
  issueTeamQuery,
  labelsQuery,
  listQuery,
  relationsQuery,
  removeLabelMutation,
  searchQuery,
  showQuery,
  teamStatesQuery,
  updateIssueMutation,
}
