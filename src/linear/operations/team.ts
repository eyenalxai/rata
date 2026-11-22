import { Effect, Schema } from "effect"

import type { LinearClientShape } from "@/linear/client"
import type { Connection, PageOptions } from "@/linear/connection"
import type { Team, TeamDetail } from "@/linear/decode/team"
import type { LinearApiError } from "@/linear/errors"

import { isUuid } from "@/domain/id"
import { collectConnection, pageOrDrain, pageSize } from "@/linear/connection"
import {
  TeamConnection,
  TeamLabelConnection,
  TeamMemberConnection,
  TeamPriority,
  TeamStateConnection,
} from "@/linear/decode/team"
import {
  issuePriorityValuesQuery,
  teamByIdQuery,
  teamByKeyQuery,
  teamByNameQuery,
  teamLabelsQuery,
  teamMembersQuery,
  teamStatesQuery,
  teamsQuery,
} from "@/linear/documents/team"

type TeamIdentity = {
  readonly id: Team["id"]
  readonly key: string
  readonly name: string
  readonly timezone: string
}

type TeamReadOperations = {
  readonly list: (options: PageOptions) => Effect.Effect<Connection<Team>, LinearApiError>
  readonly byKey: (ref: string) => Effect.Effect<Team | undefined, LinearApiError>
  readonly byName: (name: string) => Effect.Effect<Team | undefined, LinearApiError>
  readonly byId: (id: Team["id"]) => Effect.Effect<Team | undefined, LinearApiError>
  readonly details: (team: TeamIdentity) => Effect.Effect<TeamDetail, LinearApiError>
}

const makeTeamOperations = (execute: LinearClientShape["execute"]): TeamReadOperations => {
  const list = Effect.fn("LinearTeam.list")(function* listTeams(options: PageOptions) {
    const fetchPage = (after: string | null) =>
      execute(
        teamsQuery,
        { first: options.limit, after },
        Schema.Struct({ teams: TeamConnection }),
      ).pipe(Effect.map((data) => data.teams))
    return yield* pageOrDrain(fetchPage, options)
  })

  const lookup = Effect.fn("LinearTeam.lookup")(function* lookupTeam(
    query: string,
    variables: Record<string, unknown>,
  ) {
    const teams = yield* collectConnection((after) =>
      execute(
        query,
        { ...variables, first: pageSize, after },
        Schema.Struct({ teams: TeamConnection }),
      ).pipe(Effect.map((data) => data.teams)),
    )
    return teams[0]
  })

  const byKey = Effect.fn("LinearTeam.byKey")(function* findTeamByKey(ref: string) {
    const byId = isUuid(ref)
    return yield* lookup(byId ? teamByIdQuery : teamByKeyQuery, byId ? { id: ref } : { key: ref })
  })

  const byName = Effect.fn("LinearTeam.byName")(function* findTeamByName(name: string) {
    return yield* lookup(teamByNameQuery, { name })
  })

  const byId = Effect.fn("LinearTeam.byId")(function* findTeamById(id: Team["id"]) {
    return yield* lookup(teamByIdQuery, { id })
  })

  const details = Effect.fn("LinearTeam.details")(function* fetchDetails(team: TeamIdentity) {
    const states = yield* collectConnection((after) =>
      execute(
        teamStatesQuery,
        { teamId: team.id, first: pageSize, after },
        Schema.Struct({ team: Schema.Struct({ states: TeamStateConnection }) }),
      ).pipe(Effect.map((data) => data.team.states)),
    )
    const labels = yield* collectConnection((after) =>
      execute(
        teamLabelsQuery,
        { teamId: team.id, first: pageSize, after },
        Schema.Struct({ issueLabels: TeamLabelConnection }),
      ).pipe(Effect.map((data) => data.issueLabels)),
    )
    const members = yield* collectConnection((after) =>
      execute(
        teamMembersQuery,
        { teamId: team.id, first: pageSize, after },
        Schema.Struct({ team: Schema.Struct({ members: TeamMemberConnection }) }),
      ).pipe(Effect.map((data) => data.team.members)),
    )
    const priorityData = yield* execute(
      issuePriorityValuesQuery,
      {},
      Schema.Struct({
        issuePriorityValues: Schema.Array(TeamPriority),
      }),
    )
    return {
      ...team,
      states: states.toSorted((left, right) => left.position - right.position),
      labels: labels.map((label) => ({
        id: label.id,
        name: label.name,
        color: label.color,
        scope: label.team === null ? ("workspace" as const) : ("team" as const),
      })),
      members: members
        .filter((member) => member.active)
        .map((member) => ({
          id: member.id,
          name: member.name,
          displayName: member.displayName,
          email: member.email,
        })),
      priorities: priorityData.issuePriorityValues.toSorted(
        (left, right) => left.priority - right.priority,
      ),
    } satisfies TeamDetail
  })

  return { byId, byKey, byName, details, list }
}

export { makeTeamOperations, type TeamIdentity, type TeamReadOperations }
