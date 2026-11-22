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

const createLabelMutation = `mutation CreateLabel($input: IssueLabelCreateInput!) {
  issueLabelCreate(input: $input) {
    success
    issueLabel {
      id
      name
      color
    }
  }
}`

const updateLabelMutation = `mutation UpdateLabel($id: String!, $input: IssueLabelUpdateInput!) {
  issueLabelUpdate(id: $id, input: $input) {
    success
    issueLabel {
      id
      name
      color
    }
  }
}`

export { createLabelMutation, listAvailableLabelsQuery, listLabelsQuery, updateLabelMutation }
