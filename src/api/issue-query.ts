const pageSize = 50

const summaryFields = `
      id
      identifier
      title
      url
      state { name type }
      assignee { id name displayName }
      project { id name }
      parent { id identifier title }
      labels { nodes { id name } }`

const listQuery = `query IssueList($filter: IssueFilter, $first: Int!, $after: String) {
  issues(filter: $filter, first: $first, after: $after) {
    nodes {${summaryFields}
    }
    pageInfo { hasNextPage endCursor }
  }
}`

const searchQuery = `query IssueSearch($term: String!, $first: Int!, $after: String) {
  searchIssues(term: $term, first: $first, after: $after) {
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
    assignee { id name displayName }
    project { id name }
    parent { id identifier title }
    team { id key name }
    labels(first: ${pageSize}) { nodes { id name } pageInfo { hasNextPage endCursor } }
    children(first: ${pageSize}) { nodes { id identifier title state { name type } } pageInfo { hasNextPage endCursor } }
    relations(first: ${pageSize}) { nodes { type relatedIssue { id identifier title state { name type } } } pageInfo { hasNextPage endCursor } }
    inverseRelations(first: ${pageSize}) { nodes { type issue { id identifier title state { name type } } } pageInfo { hasNextPage endCursor } }
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
      nodes { type relatedIssue { id identifier title state { name type } } }
      pageInfo { hasNextPage endCursor }
    }
  }
}`

const inverseRelationsQuery = `query IssueInverseRelations($id: String!, $first: Int!, $after: String) {
  issue(id: $id) {
    inverseRelations(first: $first, after: $after) {
      nodes { type issue { id identifier title state { name type } } }
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

export {
  childrenQuery,
  commentsQuery,
  inverseRelationsQuery,
  issueIdQuery,
  labelsQuery,
  listQuery,
  pageSize,
  relationsQuery,
  searchQuery,
  showQuery,
}
