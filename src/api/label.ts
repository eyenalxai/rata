import type { Redacted } from "effect"

import { Context, Effect, Layer, Schema } from "effect"

import type { LinearApiError } from "@/api/errors"

import { LinearClient } from "@/api/client"

const Label = Schema.Struct({
  id: Schema.String,
  name: Schema.String,
  color: Schema.String,
})

type Label = typeof Label.Type

const LabelConnection = Schema.Struct({ nodes: Schema.Array(Label) })

const listLabelsQuery = `query Labels($teamId: ID!) {
  issueLabels(first: 250, filter: { team: { id: { eq: $teamId } } }) {
    nodes {
      id
      name
      color
    }
  }
}`

const listAvailableLabelsQuery = `query AvailableLabels($teamId: ID!) {
  issueLabels(first: 250, filter: { or: [{ team: { id: { eq: $teamId } } }, { team: { null: true } }] }) {
    nodes {
      id
      name
      color
    }
  }
}`

type LabelOperations = {
  readonly list: (teamId: string) => Effect.Effect<readonly Label[], LinearApiError>
  readonly listAvailable: (teamId: string) => Effect.Effect<readonly Label[], LinearApiError>
}

type LabelServiceShape = LabelOperations & {
  readonly withKey: (apiKey: Redacted.Redacted) => LabelOperations
}

const makeLabelOperations = (execute: LinearClient["Service"]["execute"]): LabelOperations => {
  const list = Effect.fn("LabelService.list")(function* listLabels(teamId: string) {
    const data = yield* execute(
      listLabelsQuery,
      { teamId },
      Schema.Struct({ issueLabels: LabelConnection }),
    )
    return data.issueLabels.nodes
  })

  const listAvailable = Effect.fn("LabelService.listAvailable")(function* listAvailableLabels(
    teamId: string,
  ) {
    const data = yield* execute(
      listAvailableLabelsQuery,
      { teamId },
      Schema.Struct({ issueLabels: LabelConnection }),
    )
    return data.issueLabels.nodes
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
