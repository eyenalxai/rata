import type { Redacted } from "effect"

import { Context, Effect, Layer, Schema } from "effect"

import type { TeamNotFoundError, TeamResolutionError } from "@/api/team"
import type { RepoConfigError } from "@/config/repo"
import type { Label } from "@/domain/label"
import type { LinearClientShape } from "@/linear/client"
import type { Connection, PageOptions } from "@/linear/connection"
import type { LinearApiError } from "@/linear/errors"
import type { LinearGatewayShape } from "@/linear/gateway"

import { LinearClient } from "@/api/client"
import { createLabelMutation, updateLabelMutation } from "@/api/label/queries"
import { RepoTeam } from "@/api/repo-team"
import { isUuid, TeamId } from "@/domain/id"
import { findLabelByName } from "@/domain/label"
import { collectConnection, pageSize } from "@/linear/connection"
import { LabelPayload } from "@/linear/decode/label"
import { LinearGateway } from "@/linear/gateway"

class LabelNotFoundError extends Schema.TaggedError<LabelNotFoundError>()("LabelNotFoundError", {
  name: Schema.String,
  teamId: TeamId,
  message: Schema.String,
}) {}

class LabelCreateError extends Schema.TaggedError<LabelCreateError>()("LabelCreateError", {
  name: Schema.String,
  message: Schema.String,
}) {}

class LabelExistsError extends Schema.TaggedError<LabelExistsError>()("LabelExistsError", {
  name: Schema.String,
  existingName: Schema.String,
  message: Schema.String,
}) {}

class LabelUpdateError extends Schema.TaggedError<LabelUpdateError>()("LabelUpdateError", {
  ref: Schema.String,
  message: Schema.String,
}) {}

const labelNotFoundError = (teamId: TeamId, name: string): LabelNotFoundError =>
  new LabelNotFoundError({
    name,
    teamId,
    message: `No label named ${name} in team ${teamId} or the workspace. Run \`rata admin label list --team <team key>\` to see the labels.`,
  })

type LabelCreateOptions = {
  readonly name: string
  readonly color?: string | undefined
  readonly team?: string | undefined
  readonly ifNotExists?: boolean | undefined
}

type LabelCreateResult = {
  readonly label: Label
  readonly created: boolean
}

type LabelUpdateOptions = {
  readonly name?: string | undefined
  readonly color?: string | undefined
  readonly team?: string | undefined
}

type LabelWriteError =
  | LabelCreateError
  | LabelExistsError
  | LabelNotFoundError
  | LabelUpdateError
  | LinearApiError
  | RepoConfigError
  | TeamNotFoundError
  | TeamResolutionError

type LabelOperations = {
  readonly list: (
    teamId: TeamId,
    options: PageOptions,
  ) => Effect.Effect<Connection<Label>, LinearApiError>
  readonly listAvailable: (
    teamId: TeamId,
    options: PageOptions,
  ) => Effect.Effect<Connection<Label>, LinearApiError>
  readonly byName: (
    teamId: TeamId,
    name: string,
  ) => Effect.Effect<Label, LabelNotFoundError | LinearApiError>
  readonly create: (
    options: LabelCreateOptions,
  ) => Effect.Effect<LabelCreateResult, LabelWriteError>
  readonly update: (
    ref: string,
    options: LabelUpdateOptions,
  ) => Effect.Effect<Label, LabelWriteError>
}

const makeLabelOperations = (
  gateway: LinearGatewayShape,
  client: LinearClientShape,
  repoTeam: RepoTeam["Service"],
): LabelOperations => {
  const list = Effect.fn("LabelService.list")(function* listLabels(
    teamId: TeamId,
    options: PageOptions,
  ) {
    return yield* gateway.label.list(teamId, options)
  })

  const listAvailable = Effect.fn("LabelService.listAvailable")(function* listAvailableLabels(
    teamId: TeamId,
    options: PageOptions,
  ) {
    return yield* gateway.label.listAvailable(teamId, options)
  })

  const byName = Effect.fn("LabelService.byName")(function* byName(teamId: TeamId, name: string) {
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
    const teamId = yield* repoTeam.resolve(options.team)
    const available = yield* collectConnection((after) =>
      listAvailable(teamId, { after, limit: pageSize }),
    )
    const existing = findLabelByName(available, options.name)
    if (existing !== undefined) {
      if (options.ifNotExists === true) {
        return { label: existing, created: false }
      }
      return yield* new LabelExistsError({
        name: options.name,
        existingName: existing.name,
        message: `The label \`${existing.name}\` already exists.`,
      })
    }
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
    return { label: data.issueLabelCreate.issueLabel, created: true }
  })

  const update = Effect.fn("LabelService.update")(function* updateLabel(
    ref: string,
    options: LabelUpdateOptions,
  ) {
    let id = ref
    if (isUuid(ref)) {
      if (options.team !== undefined) {
        yield* repoTeam.resolve(options.team)
      }
    } else {
      const teamId = yield* repoTeam.resolve(options.team)
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

  return { byName, create, list, listAvailable, update }
}

class LabelService extends Context.Service<
  LabelService,
  LabelOperations & { readonly withKey: (apiKey: Redacted.Redacted) => LabelOperations }
>()("rata-cli/api/label/LabelService") {
  static readonly layer = Layer.effect(
    LabelService,
    Effect.gen(function* labelServiceLayer() {
      const gateway = yield* LinearGateway
      const client = yield* LinearClient
      const repoTeam = yield* RepoTeam
      return LabelService.of({
        ...makeLabelOperations(gateway, client, repoTeam),
        withKey: (apiKey) =>
          makeLabelOperations(gateway.withKey(apiKey), client.withKey(apiKey), repoTeam),
      })
    }),
  )
}

export {
  LabelCreateError,
  type LabelCreateOptions,
  type LabelCreateResult,
  LabelExistsError,
  labelNotFoundError,
  LabelNotFoundError,
  type LabelOperations,
  LabelService,
  LabelUpdateError,
  type LabelUpdateOptions,
  type LabelWriteError,
}
