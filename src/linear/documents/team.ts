const teamFields = `
      id
      key
      name
      timezone`

const teamsQuery = `query Teams($first: Int!, $after: String) {
  teams(first: $first, after: $after, orderBy: createdAt) {
    nodes {${teamFields}
    }
    pageInfo { hasNextPage endCursor }
  }
}`

const teamByKeyQuery = `query TeamByKey($key: String!, $first: Int!, $after: String) {
  teams(first: $first, after: $after, orderBy: createdAt, filter: { key: { eq: $key } }) {
    nodes {${teamFields}
    }
    pageInfo { hasNextPage endCursor }
  }
}`

const teamByNameQuery = `query TeamByName($name: String!, $first: Int!, $after: String) {
  teams(first: $first, after: $after, orderBy: createdAt, filter: { name: { eqIgnoreCase: $name } }) {
    nodes {${teamFields}
    }
    pageInfo { hasNextPage endCursor }
  }
}`

const teamByIdQuery = `query TeamById($id: ID!, $first: Int!, $after: String) {
  teams(first: $first, after: $after, orderBy: createdAt, filter: { id: { eq: $id } }) {
    nodes {${teamFields}
    }
    pageInfo { hasNextPage endCursor }
  }
}`

const teamCreateMutation = `mutation TeamCreate($input: TeamCreateInput!, $copySettingsFromTeamId: String) {
  teamCreate(input: $input, copySettingsFromTeamId: $copySettingsFromTeamId) {
    success
    team {${teamFields}
    }
  }
}`

const teamUpdateMutation = `mutation TeamUpdate($id: String!, $input: TeamUpdateInput!) {
  teamUpdate(id: $id, input: $input) {
    success
    team {${teamFields}
    }
  }
}`

const teamDeleteMutation = `mutation TeamDelete($id: String!) {
  teamDelete(id: $id) {
    success
    entityId
  }
}`

const teamStatesQuery = `query TeamStates($teamId: String!, $first: Int!, $after: String) {
  team(id: $teamId) {
    states(first: $first, after: $after) {
      nodes { id name type position }
      pageInfo { hasNextPage endCursor }
    }
  }
}`

const teamMembersQuery = `query TeamMembers($teamId: String!, $first: Int!, $after: String) {
  team(id: $teamId) {
    members(first: $first, after: $after) {
      nodes { id name displayName email active }
      pageInfo { hasNextPage endCursor }
    }
  }
}`

const teamLabelsQuery = `query TeamLabels($teamId: ID!, $first: Int!, $after: String) {
  issueLabels(first: $first, after: $after, orderBy: createdAt, filter: { or: [{ team: { id: { eq: $teamId } } }, { team: { null: true } }] }) {
    nodes { id name color team { id } }
    pageInfo { hasNextPage endCursor }
  }
}`

const issuePriorityValuesQuery = `query IssuePriorityValues {
  issuePriorityValues { priority label }
}`

export {
  issuePriorityValuesQuery,
  teamByIdQuery,
  teamByKeyQuery,
  teamByNameQuery,
  teamCreateMutation,
  teamDeleteMutation,
  teamLabelsQuery,
  teamMembersQuery,
  teamStatesQuery,
  teamsQuery,
  teamUpdateMutation,
}
