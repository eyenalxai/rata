const issueRefsQuery = `query IssueRefs($filter: IssueFilter, $first: Int!, $after: String) {
  issues(filter: $filter, first: $first, after: $after) {
    nodes { id identifier }
    pageInfo { hasNextPage endCursor }
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

const relationsWithInverseQuery = `query IssueRelationsWithInverse($id: String!, $first: Int!) {
  issue(id: $id) {
    relations(first: $first) {
      nodes { id type relatedIssue { id identifier title state { name type } } }
      pageInfo { hasNextPage endCursor }
    }
    inverseRelations(first: $first) {
      nodes { id type issue { id identifier title state { name type } } }
      pageInfo { hasNextPage endCursor }
    }
  }
}`

export { inverseRelationsQuery, issueRefsQuery, relationsQuery, relationsWithInverseQuery }
