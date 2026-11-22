import { teamFields } from "@/linear/documents/team"

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

export { teamCreateMutation, teamDeleteMutation, teamUpdateMutation }
