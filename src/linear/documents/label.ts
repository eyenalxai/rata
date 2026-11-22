const listLabelsQuery = `query Labels($teamId: ID!, $first: Int!, $after: String) {
  issueLabels(first: $first, after: $after, orderBy: createdAt, filter: { team: { id: { eq: $teamId } } }) {
    nodes {
      id
      name
      color
    }
    pageInfo { hasNextPage endCursor }
  }
}`

const listAvailableLabelsQuery = `query AvailableLabels($teamId: ID!, $first: Int!, $after: String) {
  issueLabels(first: $first, after: $after, orderBy: createdAt, filter: { or: [{ team: { id: { eq: $teamId } } }, { team: { null: true } }] }) {
    nodes {
      id
      name
      color
    }
    pageInfo { hasNextPage endCursor }
  }
}`

export { listAvailableLabelsQuery, listLabelsQuery }
