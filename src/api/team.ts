import { Context, Effect, Layer, Schema } from "effect"

import type { LinearApiError } from "@/api/errors"

import { LinearClient } from "@/api/client"
import { isUuid } from "@/domain/ref"

const Team = Schema.Struct({
  id: Schema.String,
  key: Schema.String,
  name: Schema.String,
})

type Team = typeof Team.Type

const TeamConnection = Schema.Struct({ nodes: Schema.Array(Team) })

const TeamCreatePayload = Schema.Struct({
  success: Schema.Boolean,
  team: Schema.NullOr(Team),
})

const teamsQuery = `query Teams {
  teams(first: 250) {
    nodes {
      id
      key
      name
    }
  }
}`

const teamByKeyQuery = `query TeamByKey($key: String!) {
  teams(first: 1, filter: { key: { eq: $key } }) {
    nodes {
      id
      key
      name
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
    }
  }
}`

class TeamNotFoundError extends Schema.TaggedError<TeamNotFoundError>()("TeamNotFoundError", {
  key: Schema.String,
  message: Schema.String,
}) {}

class TeamCreateError extends Schema.TaggedError<TeamCreateError>()("TeamCreateError", {
  name: Schema.String,
  message: Schema.String,
}) {}

type TeamCreateOptions = {
  readonly name: string
  readonly key?: string | undefined
  readonly description?: string | undefined
  readonly copySettingsFrom?: string | undefined
}

type TeamServiceShape = {
  readonly list: Effect.Effect<readonly Team[], LinearApiError>
  readonly byKey: (key: string) => Effect.Effect<Team, LinearApiError | TeamNotFoundError>
  readonly create: (
    options: TeamCreateOptions,
  ) => Effect.Effect<Team, LinearApiError | TeamCreateError | TeamNotFoundError>
}

class TeamService extends Context.Service<TeamService, TeamServiceShape>()(
  "rata-cli/api/team/TeamService",
) {
  static readonly layer = Layer.effect(
    TeamService,
    Effect.gen(function* teamServiceLayer() {
      const client = yield* LinearClient

      const list = client.execute(teamsQuery, {}, Schema.Struct({ teams: TeamConnection })).pipe(
        Effect.map((data) => data.teams.nodes),
        Effect.withSpan("TeamService.list"),
      )

      const byKey = Effect.fn("TeamService.byKey")(function* findTeam(key: string) {
        const data = yield* client.execute(
          teamByKeyQuery,
          { key },
          Schema.Struct({ teams: TeamConnection }),
        )
        const team = data.teams.nodes[0]
        if (team === undefined) {
          return yield* new TeamNotFoundError({
            key,
            message: `No team with key ${key}. Run \`rata team list\` to see the team keys.`,
          })
        }
        return team
      })

      const create = Effect.fn("TeamService.create")(function* createTeam(
        options: TeamCreateOptions,
      ) {
        const input: Record<string, unknown> = { name: options.name }
        if (options.key !== undefined) {
          input.key = options.key
        }
        if (options.description !== undefined) {
          input.description = options.description
        }
        const variables: Record<string, unknown> = { input }
        if (options.copySettingsFrom !== undefined) {
          variables.copySettingsFromTeamId = isUuid(options.copySettingsFrom)
            ? options.copySettingsFrom
            : (yield* byKey(options.copySettingsFrom)).id
        }
        const data = yield* client.execute(
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

      return TeamService.of({ byKey, create, list })
    }),
  )
}

export { Team, TeamCreateError, type TeamCreateOptions, TeamNotFoundError, TeamService }
