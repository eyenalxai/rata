import type { Redacted } from "effect"

import { Context, Effect, Layer, Schema } from "effect"

import type { LinearApiError } from "@/api/errors"

import { LinearClient } from "@/api/client"
import { isUuid } from "@/domain/ref"

const Team = Schema.Struct({
  id: Schema.String,
  key: Schema.String,
  name: Schema.String,
  timezone: Schema.String,
})

type Team = typeof Team.Type

const TeamConnection = Schema.Struct({ nodes: Schema.Array(Team) })

const TeamCreatePayload = Schema.Struct({
  success: Schema.Boolean,
  team: Schema.NullOr(Team),
})

const TeamUpdatePayload = Schema.Struct({
  success: Schema.Boolean,
  team: Schema.NullOr(Team),
})

const DeletePayload = Schema.Struct({
  success: Schema.Boolean,
  entityId: Schema.String,
})

const teamsQuery = `query Teams {
  teams(first: 250) {
    nodes {
      id
      key
      name
      timezone
    }
  }
}`

const teamByKeyQuery = `query TeamByKey($key: String!) {
  teams(first: 1, filter: { key: { eq: $key } }) {
    nodes {
      id
      key
      name
      timezone
    }
  }
}`

const teamByIdQuery = `query TeamById($id: ID!) {
  teams(first: 1, filter: { id: { eq: $id } }) {
    nodes {
      id
      key
      name
      timezone
    }
  }
}`

const teamCreateMutation = `mutation TeamCreate($input: TeamCreateInput!, $copySettingsFromTeamId: String) {
  teamCreate(input: $input, copySettingsFromTeamId: $copySettingsFromTeamId) {
    success
    team {
      id
      key
      name
      timezone
    }
  }
}`

const teamUpdateMutation = `mutation TeamUpdate($id: String!, $input: TeamUpdateInput!) {
  teamUpdate(id: $id, input: $input) {
    success
    team {
      id
      key
      name
      timezone
    }
  }
}`

const teamDeleteMutation = `mutation TeamDelete($id: String!) {
  teamDelete(id: $id) {
    success
    entityId
  }
}`

class TeamNotFoundError extends Schema.TaggedError<TeamNotFoundError>()("TeamNotFoundError", {
  key: Schema.String,
  message: Schema.String,
}) {}

class TeamResolutionError extends Schema.TaggedError<TeamResolutionError>()("TeamResolutionError", {
  message: Schema.String,
}) {}

class TeamCreateError extends Schema.TaggedError<TeamCreateError>()("TeamCreateError", {
  name: Schema.String,
  message: Schema.String,
}) {}

class TeamDeleteError extends Schema.TaggedError<TeamDeleteError>()("TeamDeleteError", {
  key: Schema.String,
  message: Schema.String,
}) {}

class TeamUpdateError extends Schema.TaggedError<TeamUpdateError>()("TeamUpdateError", {
  key: Schema.String,
  message: Schema.String,
}) {}

type TeamCreateOptions = {
  readonly name: string
  readonly key?: string | undefined
  readonly description?: string | undefined
  readonly copySettingsFrom?: string | undefined
  readonly timezone?: string | undefined
}

type DeletedTeam = {
  readonly id: string
  readonly key: string
  readonly name: string
}

type TeamOperations = {
  readonly list: Effect.Effect<readonly Team[], LinearApiError>
  readonly byKey: (ref: string) => Effect.Effect<Team, LinearApiError | TeamNotFoundError>
  readonly byId: (id: string) => Effect.Effect<Team, LinearApiError | TeamNotFoundError>
  readonly create: (
    options: TeamCreateOptions,
  ) => Effect.Effect<Team, LinearApiError | TeamCreateError | TeamNotFoundError>
  readonly updateTimezone: (
    team: Team,
    timezone: string,
  ) => Effect.Effect<Team, LinearApiError | TeamUpdateError>
  readonly delete: (team: Team) => Effect.Effect<DeletedTeam, LinearApiError | TeamDeleteError>
}

type TeamServiceShape = TeamOperations & {
  readonly withKey: (apiKey: Redacted.Redacted) => TeamOperations
}

const makeTeamOperations = (execute: LinearClient["Service"]["execute"]): TeamOperations => {
  const list = execute(teamsQuery, {}, Schema.Struct({ teams: TeamConnection })).pipe(
    Effect.map((data) => data.teams.nodes),
    Effect.withSpan("TeamService.list"),
  )

  const byKey = Effect.fn("TeamService.byKey")(function* findTeam(ref: string) {
    const byId = isUuid(ref)
    const data = yield* execute(
      byId ? teamByIdQuery : teamByKeyQuery,
      byId ? { id: ref } : { key: ref },
      Schema.Struct({ teams: TeamConnection }),
    )
    const team = data.teams.nodes[0]
    if (team === undefined) {
      return yield* new TeamNotFoundError({
        key: ref,
        message: byId
          ? `No team with id ${ref}. Run \`rata team list\` to see the teams.`
          : `No team with key ${ref}. Run \`rata team list\` to see the team keys.`,
      })
    }
    return team
  })

  const byId = Effect.fn("TeamService.byId")(function* findTeamById(id: string) {
    const data = yield* execute(teamByIdQuery, { id }, Schema.Struct({ teams: TeamConnection }))
    const team = data.teams.nodes[0]
    if (team === undefined) {
      return yield* new TeamNotFoundError({
        key: id,
        message: `No team with id ${id}. Run \`rata team list\` to see the teams.`,
      })
    }
    return team
  })

  const create = Effect.fn("TeamService.create")(function* createTeam(options: TeamCreateOptions) {
    const input: Record<string, unknown> = { name: options.name }
    if (options.key !== undefined) {
      input.key = options.key
    }
    if (options.description !== undefined) {
      input.description = options.description
    }
    if (options.timezone !== undefined) {
      input.timezone = options.timezone
    }
    const variables: Record<string, unknown> = { input }
    if (options.copySettingsFrom !== undefined) {
      variables.copySettingsFromTeamId = isUuid(options.copySettingsFrom)
        ? options.copySettingsFrom
        : (yield* byKey(options.copySettingsFrom)).id
    }
    const data = yield* execute(
      teamCreateMutation,
      variables,
      Schema.Struct({ teamCreate: TeamCreatePayload }),
    )
    if (!data.teamCreate.success || data.teamCreate.team === null) {
      return yield* new TeamCreateError({
        name: options.name,
        message: `Linear did not create the team ${options.name}.`,
      })
    }
    return data.teamCreate.team
  })

  const updateTimezone = Effect.fn("TeamService.updateTimezone")(function* updateTeamTimezone(
    team: Team,
    timezone: string,
  ) {
    const data = yield* execute(
      teamUpdateMutation,
      { id: team.id, input: { timezone } },
      Schema.Struct({ teamUpdate: TeamUpdatePayload }),
    )
    if (!data.teamUpdate.success || data.teamUpdate.team === null) {
      return yield* new TeamUpdateError({
        key: team.key,
        message: `Linear did not update the timezone of the team ${team.key}.`,
      })
    }
    return data.teamUpdate.team
  })

  const deleteTeam = Effect.fn("TeamService.delete")(function* deleteTeam(team: Team) {
    const data = yield* execute(
      teamDeleteMutation,
      { id: team.id },
      Schema.Struct({ teamDelete: DeletePayload }),
    )
    if (!data.teamDelete.success) {
      return yield* new TeamDeleteError({
        key: team.key,
        message: `Linear did not delete the team ${team.key}.`,
      })
    }
    return { id: data.teamDelete.entityId, key: team.key, name: team.name }
  })

  return { byId, byKey, create, delete: deleteTeam, list, updateTimezone }
}

class TeamService extends Context.Service<TeamService, TeamServiceShape>()(
  "rata-cli/api/team/TeamService",
) {
  static readonly layer = Layer.effect(
    TeamService,
    Effect.gen(function* teamServiceLayer() {
      const client = yield* LinearClient
      return TeamService.of({
        ...makeTeamOperations(client.execute),
        withKey: (apiKey) =>
          makeTeamOperations((query, variables, data) =>
            client.executeWithKey(apiKey, query, variables, data),
          ),
      })
    }),
  )
}

export {
  type DeletedTeam,
  Team,
  TeamCreateError,
  type TeamCreateOptions,
  TeamDeleteError,
  TeamNotFoundError,
  type TeamOperations,
  TeamResolutionError,
  TeamService,
  TeamUpdateError,
}
