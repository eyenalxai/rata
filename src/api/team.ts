import { Context, Effect, Layer, Schema } from "effect"

import type { LinearApiError } from "@/api/errors"

import { LinearClient } from "@/api/client"

const Team = Schema.Struct({
  id: Schema.String,
  key: Schema.String,
  name: Schema.String,
})

type Team = typeof Team.Type

const TeamConnection = Schema.Struct({ nodes: Schema.Array(Team) })

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

class TeamNotFoundError extends Schema.TaggedError<TeamNotFoundError>()("TeamNotFoundError", {
  key: Schema.String,
  message: Schema.String,
}) {}

type TeamServiceShape = {
  readonly list: Effect.Effect<readonly Team[], LinearApiError>
  readonly byKey: (key: string) => Effect.Effect<Team, LinearApiError | TeamNotFoundError>
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

      return TeamService.of({ list, byKey })
    }),
  )
}

export { Team, TeamNotFoundError, TeamService }
