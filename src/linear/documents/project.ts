const projectFields = `
      id
      name
      progress
      status {
        name
      }
      trashed`

const listProjectsQuery = `query Projects($first: Int!, $after: String, $includeArchived: Boolean, $filter: ProjectFilter) {
  projects(first: $first, after: $after, orderBy: createdAt, includeArchived: $includeArchived, filter: $filter) {
    nodes {${projectFields}
    }
    pageInfo { hasNextPage endCursor }
  }
}`

const projectByIdQuery = `query ProjectById($id: ID!, $includeArchived: Boolean) {
  projects(first: 1, filter: { id: { eq: $id } }, includeArchived: $includeArchived) {
    nodes {${projectFields}
    }
  }
}`

export { listProjectsQuery, projectByIdQuery, projectFields }
