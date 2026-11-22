const viewerQuery = `query Viewer {
  viewer {
    id
    name
    displayName
    email
    active
    admin
    organization {
      id
      name
      urlKey
    }
  }
}`

export { viewerQuery }
