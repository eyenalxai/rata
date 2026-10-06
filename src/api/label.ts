import type { Redacted } from "effect"

import { Context, Effect, Layer, Schema } from "effect"

import type { LinearApiError } from "@/api/errors"
import type { Connection, PageOptions } from "@/api/pagination"

import { LinearClient } from "@/api/client"
import { PageInfo } from "@/api/pagination"

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

type LabelOperations = {
  readonly list: (
    teamId: string,
    options: PageOptions,
  ) => Effect.Effect<Connection<Label>, LinearApiError>
  readonly listAvailable: (
    teamId: string,
    options: PageOptions,
  ) => Effect.Effect<Connection<Label>, LinearApiError>
}

type LabelServiceShape = LabelOperations & {
  readonly withKey: (apiKey: Redacted.Redacted) => LabelOperations
}

const makeLabelOperations = (execute: LinearClient["Service"]["execute"]): LabelOperations => {
  const list = Effect.fn("LabelService.list")(function* listLabels(
    teamId: string,
    options: PageOptions,
  ) {
    const data = yield* execute(
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
    const data = yield* execute(
      listAvailableLabelsQuery,
      { teamId, first: options.limit, after: options.after },
      Schema.Struct({ issueLabels: LabelConnection }),
    )
    return data.issueLabels
  })

  return { list, listAvailable }
}

class LabelService extends Context.Service<LabelService, LabelServiceShape>()(
  "rata-cli/api/label/LabelService",
) {
  static readonly layer = Layer.effect(
    LabelService,
    Effect.gen(function* labelServiceLayer() {
      const client = yield* LinearClient
      return LabelService.of({
        ...makeLabelOperations(client.execute),
        withKey: (apiKey) => makeLabelOperations(client.withKey(apiKey).execute),
      })
    }),
  )
}

export { Label, type LabelOperations, LabelService }
