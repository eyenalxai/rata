const projectFields = `
      id
      name
      progress
      status {
        name
      }
      trashed`

const projectCreateMutation = `mutation ProjectCreate($input: ProjectCreateInput!) {
  projectCreate(input: $input) {
    success
    project {${projectFields}
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

export { projectCreateMutation, projectDeleteMutation, projectUnarchiveMutation }
