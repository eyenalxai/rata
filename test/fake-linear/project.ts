import type { FakeProject, GraphQLRequest } from "@test/fake-linear/model"

import { inputOf, jsonResponse, paginate, stringField } from "@test/fake-linear/model"

const withTrashed = (project: FakeProject) => ({
  ...project,
  trashed: project.trashed ?? null,
})

const handleProjectMutation = (
  graphql: GraphQLRequest,
  projects: FakeProject[],
): Response | undefined => {
  if (graphql.query.includes("mutation ProjectCreate")) {
    const input = inputOf(graphql.variables)
    const created: FakeProject = {
      id: `project-${projects.length + 1}`,
      name: stringField(input, "name"),
      progress: 0,
      status: { name: "Backlog" },
    }
    projects.push(created)
    return jsonResponse({
      data: { projectCreate: { success: true, project: withTrashed(created) } },
    })
  }
  if (graphql.query.includes("mutation ProjectDelete")) {
    const id = stringField(graphql.variables, "id")
    const index = projects.findIndex((item) => item.id === id)
    const current = projects[index]
    if (current === undefined) {
      return jsonResponse({ data: { projectDelete: { success: false, entity: null } } })
    }
    const deleted: FakeProject = { ...current, trashed: true }
    projects[index] = deleted
    return jsonResponse({
      data: { projectDelete: { success: true, entity: withTrashed(deleted) } },
    })
  }
  if (graphql.query.includes("mutation ProjectUnarchive")) {
    const id = stringField(graphql.variables, "id")
    const index = projects.findIndex((item) => item.id === id)
    const current = projects[index]
    if (current === undefined) {
      return jsonResponse({ data: { projectUnarchive: { success: false, entity: null } } })
    }
    const restored: FakeProject = { ...current, trashed: false }
    projects[index] = restored
    return jsonResponse({
      data: { projectUnarchive: { success: true, entity: withTrashed(restored) } },
    })
  }
  return undefined
}

const handleProjectQuery = (
  graphql: GraphQLRequest,
  projects: readonly FakeProject[],
): Response | undefined => {
  if (graphql.query.includes("query Projects")) {
    const includeArchived = graphql.variables.includeArchived === true
    const visible = projects
      .filter((project) => includeArchived || project.trashed !== true)
      .map(withTrashed)
    return jsonResponse({ data: { projects: paginate(visible, graphql.variables) } })
  }
  if (graphql.query.includes("query ProjectById")) {
    const id = graphql.variables.id
    const includeArchived = graphql.variables.includeArchived === true
    const visible = projects
      .filter((project) => project.id === id && (includeArchived || project.trashed !== true))
      .map(withTrashed)
    return jsonResponse({ data: { projects: paginate(visible, graphql.variables) } })
  }
  return undefined
}

export { handleProjectMutation, handleProjectQuery }
