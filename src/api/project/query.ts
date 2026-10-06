const projectFields = `
      id
      name
      progress
      status {
        name
      }
      trashed`

const listProjectsQuery = `query Projects($first: Int!, $after: String, $includeArchived: Boolean) {
  projects(first: $first, after: $after, orderBy: createdAt, includeArchived: $includeArchived) {
    nodes {${projectFields}
    }
    pageInfo { hasNextPage endCursor }
  }
}`

const projectCreateMutation = `mutation ProjectCreate($input: ProjectCreateInput!) {
  projectCreate(input: $input) {
    success
    project {${projectFields}
    }
  }
}`

const projectByIdQuery = `query ProjectById($id: ID!, $includeArchived: Boolean) {
  projects(first: 1, filter: { id: { eq: $id } }, includeArchived: $includeArchived) {
    nodes {${projectFields}
    }
  }
}`

const projectDeleteMutation = `mutation ProjectDelete($id: String!) {
  projectDelete(id: $id) {
    success
    entity {${projectFields}
    }
  }
}`

const projectUnarchiveMutation = `mutation ProjectUnarchive($id: String!) {
  projectUnarchive(id: $id) {
    success
    entity {${projectFields}
    }
  }
}`

export {
  listProjectsQuery,
  projectByIdQuery,
  projectCreateMutation,
  projectDeleteMutation,
  projectUnarchiveMutation,
}
