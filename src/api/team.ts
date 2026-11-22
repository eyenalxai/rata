import type { Redacted } from "effect"

import { Context, Effect, Layer, Schema } from "effect"

import type { Connection, PageOptions } from "@/linear/connection"
import type { Team, TeamDetail } from "@/linear/decode/team"
import type { LinearApiError } from "@/linear/errors"
import type { LinearGatewayShape } from "@/linear/gateway"

import { isUuid, teamId } from "@/domain/id"
import { DeletePayload, TeamWritePayload } from "@/linear/decode/team"
import { teamCreateMutation, teamDeleteMutation, teamUpdateMutation } from "@/linear/documents/team"
import { LinearGateway } from "@/linear/gateway"

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
  readonly id: Team["id"]
  readonly key: string
  readonly name: string
}

type TeamOperations = {
  readonly list: (options: PageOptions) => Effect.Effect<Connection<Team>, LinearApiError>
  readonly byKey: (ref: string) => Effect.Effect<Team, LinearApiError | TeamNotFoundError>
  readonly byName: (name: string) => Effect.Effect<Team, LinearApiError | TeamNotFoundError>
  readonly byId: (id: Team["id"]) => Effect.Effect<Team, LinearApiError | TeamNotFoundError>
  readonly details: (ref: string) => Effect.Effect<TeamDetail, LinearApiError | TeamNotFoundError>
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

const requireTeam = (
  ref: string,
  lookup: Effect.Effect<Team | undefined, LinearApiError>,
  byId: boolean,
): Effect.Effect<Team, LinearApiError | TeamNotFoundError> =>
  lookup.pipe(
    Effect.filterOrFail(
      (team): team is Team => team !== undefined,
      () =>
        new TeamNotFoundError({
          key: ref,
          message: byId ? `No team with id ${ref}.` : `No team with key ${ref}.`,
        }),
    ),
  )

const makeTeamOperations = (gateway: LinearGatewayShape): TeamOperations => {
  const list = Effect.fn("TeamService.list")(function* listTeams(options: PageOptions) {
    return yield* gateway.team.list(options)
  })

  const byKey = Effect.fn("TeamService.byKey")(function* findTeam(ref: string) {
    return yield* requireTeam(ref, gateway.team.byKey(ref), isUuid(ref))
  })

  const byName = Effect.fn("TeamService.byName")(function* findTeamByName(name: string) {
    const team = yield* gateway.team.byName(name)
    if (team === undefined) {
      return yield* new TeamNotFoundError({
        key: name,
        message: `No team named ${name}.`,
      })
    }
    return team
  })

  const byId = Effect.fn("TeamService.byId")(function* findTeamById(id: Team["id"]) {
    const team = yield* gateway.team.byId(id)
    if (team === undefined) {
      return yield* new TeamNotFoundError({
        key: id,
        message: `No team with id ${id}.`,
      })
    }
    return team
  })

  const details = Effect.fn("TeamService.details")(function* teamDetails(ref: string) {
    const team = yield* byKey(ref)
    return yield* gateway.team.details(team)
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
    const data = yield* gateway.client.execute(
      teamCreateMutation,
      variables,
      Schema.Struct({ teamCreate: TeamWritePayload }),
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
    const data = yield* gateway.client.execute(
      teamUpdateMutation,
      { id: team.id, input: { timezone } },
      Schema.Struct({ teamUpdate: TeamWritePayload }),
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
    const data = yield* gateway.client.execute(
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
    return { id: teamId(data.teamDelete.entityId), key: team.key, name: team.name }
  })

  return { byId, byKey, byName, create, delete: deleteTeam, details, list, updateTimezone }
}

class TeamService extends Context.Service<TeamService, TeamServiceShape>()(
  "rata-cli/api/team/TeamService",
) {
  static readonly layer = Layer.effect(
    TeamService,
    Effect.gen(function* teamServiceLayer() {
      const gateway = yield* LinearGateway
      return TeamService.of({
        ...makeTeamOperations(gateway),
        withKey: (apiKey) => makeTeamOperations(gateway.withKey(apiKey)),
      })
    }),
  )
}

export {
  type DeletedTeam,
  TeamCreateError,
  type TeamCreateOptions,
  TeamDeleteError,
  TeamNotFoundError,
  type TeamOperations,
  TeamResolutionError,
  TeamService,
  TeamUpdateError,
}
