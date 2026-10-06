import { Context, Effect, Layer, Option, Schema } from "effect"

import type { LinearApiError } from "@/api/errors"
import type { Connection, PageOptions } from "@/api/pagination"
import type { TeamNotFoundError } from "@/api/team"
import type { RepoConfigError } from "@/config/repo"

import { LinearClient } from "@/api/client"
import { collectConnection, PageInfo, pageSize } from "@/api/pagination"
import { TeamResolutionError, TeamService } from "@/api/team"
import { currentDirectory, RepoConfigService } from "@/config/repo"
import { findLabelByName } from "@/domain/labels"
import { isUuid } from "@/domain/ref"

const Label = Schema.Struct({
  id: Schema.String,
  name: Schema.String,
  color: Schema.String,
})

type Label = typeof Label.Type

const LabelConnection = Schema.Struct({
  nodes: Schema.Array(Label),
  pageInfo: PageInfo,
})

const LabelPayload = Schema.Struct({
  success: Schema.Boolean,
  issueLabel: Schema.NullOr(Label),
})

const listLabelsQuery = `query Labels($teamId: ID!, $first: Int!, $after: String) {
  issueLabels(first: $first, after: $after, orderBy: createdAt, filter: { team: { id: { eq: $teamId } } }) {
    nodes {
      id
      name
      color
    }
    pageInfo { hasNextPage endCursor }
  }
}`

const listAvailableLabelsQuery = `query AvailableLabels($teamId: ID!, $first: Int!, $after: String) {
  issueLabels(first: $first, after: $after, orderBy: createdAt, filter: { or: [{ team: { id: { eq: $teamId } } }, { team: { null: true } }] }) {
    nodes {
      id
      name
      color
    }
    pageInfo { hasNextPage endCursor }
  }
}`

const createLabelMutation = `mutation CreateLabel($input: IssueLabelCreateInput!) {
  issueLabelCreate(input: $input) {
    success
    issueLabel {
      id
      name
      color
    }
  }
}`

const updateLabelMutation = `mutation UpdateLabel($id: String!, $input: IssueLabelUpdateInput!) {
  issueLabelUpdate(id: $id, input: $input) {
    success
    issueLabel {
      id
      name
      color
    }
  }
}`

class LabelNotFoundError extends Schema.TaggedError<LabelNotFoundError>()("LabelNotFoundError", {
  name: Schema.String,
  teamId: Schema.String,
  message: Schema.String,
}) {}

class LabelCreateError extends Schema.TaggedError<LabelCreateError>()("LabelCreateError", {
  name: Schema.String,
  message: Schema.String,
}) {}

class LabelUpdateError extends Schema.TaggedError<LabelUpdateError>()("LabelUpdateError", {
  ref: Schema.String,
  message: Schema.String,
}) {}

const labelNotFoundError = (teamId: string, name: string): LabelNotFoundError =>
  new LabelNotFoundError({
    name,
    teamId,
    message: `No label named ${name} in team ${teamId} or the workspace. Run \`rata label list --team <team key>\` to see the labels.`,
  })

type LabelCreateOptions = {
  readonly name: string
  readonly color?: string | undefined
  readonly team?: string | undefined
}

type LabelUpdateOptions = {
  readonly name?: string | undefined
  readonly color?: string | undefined
  readonly team?: string | undefined
}

type LabelWriteError =
  | LabelCreateError
  | LabelNotFoundError
  | LabelUpdateError
  | LinearApiError
  | RepoConfigError
  | TeamNotFoundError
  | TeamResolutionError

type LabelOperations = {
  readonly list: (
    teamId: string,
    options: PageOptions,
  ) => Effect.Effect<Connection<Label>, LinearApiError>
  readonly listAvailable: (
    teamId: string,
    options: PageOptions,
  ) => Effect.Effect<Connection<Label>, LinearApiError>
  readonly byName: (
    teamId: string,
    name: string,
  ) => Effect.Effect<Label, LabelNotFoundError | LinearApiError>
  readonly create: (options: LabelCreateOptions) => Effect.Effect<Label, LabelWriteError>
  readonly update: (
    ref: string,
    options: LabelUpdateOptions,
  ) => Effect.Effect<Label, LabelWriteError>
}

class LabelService extends Context.Service<LabelService, LabelOperations>()(
  "rata-cli/api/label/LabelService",
) {
  static readonly layer = Layer.effect(
    LabelService,
    Effect.gen(function* labelServiceLayer() {
      const client = yield* LinearClient
      const teams = yield* TeamService
      const repoConfig = yield* RepoConfigService

      const list = Effect.fn("LabelService.list")(function* listLabels(
        teamId: string,
        options: PageOptions,
      ) {
        const data = yield* client.execute(
          listLabelsQuery,
          { teamId, first: options.limit, after: options.after },
          Schema.Struct({ issueLabels: LabelConnection }),
        )
        return data.issueLabels
      })

      const listAvailable = Effect.fn("LabelService.listAvailable")(function* listAvailableLabels(
        teamId: string,
        options: PageOptions,
      ) {
        const data = yield* client.execute(
          listAvailableLabelsQuery,
          { teamId, first: options.limit, after: options.after },
          Schema.Struct({ issueLabels: LabelConnection }),
        )
        return data.issueLabels
      })

      const teamIdFor = Effect.fn("LabelService.teamIdFor")(function* teamIdFor(value: string) {
        if (isUuid(value)) {
          return value
        }
        const team = yield* teams.byKey(value)
        return team.id
      })

      const resolveTeamId = Effect.fn("LabelService.resolveTeamId")(function* resolveTeamId(
        team: string | undefined,
      ) {
        const config = Option.getOrUndefined(yield* repoConfig.read(yield* currentDirectory))
        const value = team ?? config?.team
        if (value === undefined) {
          return yield* new TeamResolutionError({
            message: "No team. Pass --team, or run `rata link`.",
          })
        }
        return yield* teamIdFor(value)
      })

      const byName = Effect.fn("LabelService.byName")(function* byName(
        teamId: string,
        name: string,
      ) {
        const available = yield* collectConnection((after) =>
          listAvailable(teamId, { after, limit: pageSize }),
        )
        const match = findLabelByName(available, name)
        if (match === undefined) {
          return yield* labelNotFoundError(teamId, name)
        }
        return match
      })

      const create = Effect.fn("LabelService.create")(function* createLabel(
        options: LabelCreateOptions,
      ) {
        const teamId = yield* resolveTeamId(options.team)
        const input: Record<string, unknown> = { name: options.name, teamId }
        if (options.color !== undefined) {
          input.color = options.color
        }
        const data = yield* client.execute(
          createLabelMutation,
          { input },
          Schema.Struct({ issueLabelCreate: LabelPayload }),
        )
        if (!data.issueLabelCreate.success || data.issueLabelCreate.issueLabel === null) {
          return yield* new LabelCreateError({
            name: options.name,
            message: `Linear did not create the label ${options.name}.`,
          })
        }
        return data.issueLabelCreate.issueLabel
      })

      const update = Effect.fn("LabelService.update")(function* updateLabel(
        ref: string,
        options: LabelUpdateOptions,
      ) {
        let id = ref
        if (isUuid(ref)) {
          if (options.team !== undefined) {
            yield* resolveTeamId(options.team)
          }
        } else {
          const teamId = yield* resolveTeamId(options.team)
          const match = yield* byName(teamId, ref)
          id = match.id
        }
        const input: Record<string, unknown> = {}
        if (options.name !== undefined) {
          input.name = options.name
        }
        if (options.color !== undefined) {
          input.color = options.color
        }
        const data = yield* client.execute(
          updateLabelMutation,
          { id, input },
          Schema.Struct({ issueLabelUpdate: LabelPayload }),
        )
        if (!data.issueLabelUpdate.success || data.issueLabelUpdate.issueLabel === null) {
          return yield* new LabelUpdateError({
            ref,
            message: `Linear did not update the label ${ref}.`,
          })
        }
        return data.issueLabelUpdate.issueLabel
      })

      return LabelService.of({ byName, create, list, listAvailable, update })
    }),
  )
}

export {
  Label,
  LabelCreateError,
  type LabelCreateOptions,
  labelNotFoundError,
  LabelNotFoundError,
  type LabelOperations,
  LabelService,
  LabelUpdateError,
  type LabelUpdateOptions,
  type LabelWriteError,
}
