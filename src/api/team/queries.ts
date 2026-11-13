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

export {
  teamByIdQuery,
  teamByKeyQuery,
  teamByNameQuery,
  teamCreateMutation,
  teamDeleteMutation,
  teamsQuery,
  teamUpdateMutation,
}
