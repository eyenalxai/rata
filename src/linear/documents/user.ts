const userByIdQuery = `query UserById($id: ID!) {
  users(filter: { id: { eq: $id } }, includeDisabled: true, first: 1) {
    nodes { id }
  }
}`

export { userByIdQuery }
