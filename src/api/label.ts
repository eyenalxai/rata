import type { Redacted } from "effect"

import { Context, Effect, Layer, Schema } from "effect"

import type { LinearApiError } from "@/api/errors"
import type { Connection, PageOptions } from "@/api/pagination"
import type { TeamNotFoundError, TeamResolutionError } from "@/api/team"
import type { RepoConfigError } from "@/config/repo"

import { LinearClient } from "@/api/client"
import { collectConnection, pageOrDrain, PageInfo, pageSize } from "@/api/pagination"
import { RepoTeam } from "@/api/repo-team"
import { findLabelByName } from "@/domain/labels"
import { isUuid } from "@/domain/ref"

const Label = Schema.Struct({ id: Schema.String, name: Schema.String, color: Schema.String })

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

class LabelExistsError extends Schema.TaggedError<LabelExistsError>()("LabelExistsError", {
  name: Schema.String,
  existingName: Schema.String,
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
  readonly create: (
    options: LabelCreateOptions,
  ) => Effect.Effect<LabelCreateResult, LabelWriteError>
  readonly update: (
    ref: string,
    options: LabelUpdateOptions,
  ) => Effect.Effect<Label, LabelWriteError>
}

const makeLabelOperations = (
  execute: LinearClient["Service"]["execute"],
  repoTeam: RepoTeam["Service"],
): LabelOperations => {
  const list = Effect.fn("LabelService.list")(function* listLabels(
    teamId: string,
    options: PageOptions,
  ) {
    const fetchPage = (after: string | null) =>
      execute(
        listLabelsQuery,
        { teamId, first: options.limit, after },
        Schema.Struct({ issueLabels: LabelConnection }),
      ).pipe(Effect.map((data) => data.issueLabels))
    return yield* pageOrDrain(fetchPage, options)
  })

  const listAvailable = Effect.fn("LabelService.listAvailable")(function* listAvailableLabels(
    teamId: string,
    options: PageOptions,
  ) {
    const data = yield* execute(
      listAvailableLabelsQuery,
      { teamId, first: options.limit, after: options.after },
      Schema.Struct({ issueLabels: LabelConnection }),
    )
    return data.issueLabels
  })

  const byName = Effect.fn("LabelService.byName")(function* byName(teamId: string, name: string) {
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
    const data = yield* execute(
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
    const data = yield* execute(
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
      const client = yield* LinearClient
      const repoTeam = yield* RepoTeam
      return LabelService.of({
        ...makeLabelOperations(client.execute, repoTeam),
        withKey: (apiKey) => makeLabelOperations(client.withKey(apiKey).execute, repoTeam),
      })
    }),
  )
}

export {
  Label,
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
