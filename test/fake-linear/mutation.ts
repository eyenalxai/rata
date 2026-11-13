import type {
  FakeLabel,
  FakePriority,
  FakeProject,
  FakeTeam,
  GraphQLRequest,
} from "@test/fake-linear/model"

import { inputOf, jsonResponse, stringField } from "@test/fake-linear/model"
import { handleProjectMutation } from "@test/fake-linear/project"

type FakeState = {
  readonly teams: FakeTeam[]
  readonly labels: FakeLabel[]
  readonly projects: FakeProject[]
  readonly priorities: readonly FakePriority[]
}

const handleMutation = (graphql: GraphQLRequest, state: FakeState): Response | undefined => {
  const query = graphql.query
  if (query.includes("mutation TeamCreate")) {
    const input = inputOf(graphql.variables)
    const name = stringField(input, "name")
    const created = {
      id: `team-${state.teams.length + 1}`,
      key: typeof input.key === "string" ? input.key : "AUTO",
      name,
      timezone: typeof input.timezone === "string" ? input.timezone : "America/Los_Angeles",
    }
    state.teams.push(created)
    return jsonResponse({ data: { teamCreate: { success: true, team: created } } })
  }
  if (query.includes("mutation TeamUpdate")) {
    const id = stringField(graphql.variables, "id")
    const timezone = stringField(inputOf(graphql.variables), "timezone")
    const index = state.teams.findIndex((item) => item.id === id)
    const current = state.teams[index]
    if (current === undefined) {
      return jsonResponse({ data: { teamUpdate: { success: false, team: null } } })
    }
    const updated = { ...current, timezone }
    state.teams[index] = updated
    return jsonResponse({ data: { teamUpdate: { success: true, team: updated } } })
  }
  if (query.includes("mutation CreateLabel")) {
    const input = inputOf(graphql.variables)
    const name = stringField(input, "name")
    const created = {
      id: `label-${state.labels.length + 1}`,
      name,
      color: "#5E6AD2",
      teamId: stringField(input, "teamId"),
    }
    state.labels.push(created)
    return jsonResponse({
      data: {
        issueLabelCreate: {
          success: true,
          issueLabel: { id: created.id, name: created.name, color: created.color },
        },
      },
    })
  }
  if (query.includes("mutation TeamDelete")) {
    const id = stringField(graphql.variables, "id")
    const index = state.teams.findIndex((item) => item.id === id)
    if (index === -1) {
      return jsonResponse({ data: { teamDelete: { success: false, entityId: id } } })
    }
    state.teams.splice(index, 1)
    return jsonResponse({ data: { teamDelete: { success: true, entityId: id } } })
  }
  return handleProjectMutation(graphql, state.projects)
}

export { type FakeState, handleMutation }
