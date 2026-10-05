import { Context, Effect, Layer, Schema } from "effect"

import type { LinearApiError } from "@/api/errors"

import { LinearClient } from "@/api/client"
import { findLabelByName, planLabelEnsure } from "@/domain/labels"

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

const IssueLabelPayload = Schema.Struct({
  success: Schema.Boolean,
  issueLabel: Label,
})

class LabelCreateError extends Schema.TaggedError<LabelCreateError>()("LabelCreateError", {
  name: Schema.String,
  message: Schema.String,
}) {}

type LabelEnsureResult = {
  readonly created: readonly Label[]
  readonly existing: readonly Label[]
}

type LabelServiceShape = {
  readonly list: (teamId: string) => Effect.Effect<readonly Label[], LinearApiError>
  readonly listAvailable: (teamId: string) => Effect.Effect<readonly Label[], LinearApiError>
  readonly ensure: (
    teamId: string,
  ) => Effect.Effect<LabelEnsureResult, LinearApiError | LabelCreateError>
}

class LabelService extends Context.Service<LabelService, LabelServiceShape>()(
  "rata-cli/api/label/LabelService",
) {
  static readonly layer = Layer.effect(
    LabelService,
    Effect.gen(function* labelServiceLayer() {
      const client = yield* LinearClient

      const list = Effect.fn("LabelService.list")(function* listLabels(teamId: string) {
        const data = yield* client.execute(
          listLabelsQuery,
          { teamId },
          Schema.Struct({ issueLabels: LabelConnection }),
        )
        return data.issueLabels.nodes
      })

      const listAvailable = Effect.fn("LabelService.listAvailable")(function* listAvailableLabels(
        teamId: string,
      ) {
        const data = yield* client.execute(
          listAvailableLabelsQuery,
          { teamId },
          Schema.Struct({ issueLabels: LabelConnection }),
        )
        return data.issueLabels.nodes
      })

      const create = Effect.fn("LabelService.create")(function* createLabel(
        teamId: string,
        name: string,
      ) {
        const data = yield* client.execute(
          createLabelMutation,
          { input: { name, teamId } },
          Schema.Struct({ issueLabelCreate: IssueLabelPayload }),
        )
        if (!data.issueLabelCreate.success) {
          return yield* new LabelCreateError({
            name,
            message: `Linear did not create the label ${name}.`,
          })
        }
        return data.issueLabelCreate.issueLabel
      })

      const ensure = Effect.fn("LabelService.ensure")(function* ensureLabels(teamId: string) {
        const available = yield* listAvailable(teamId)
        const plan = planLabelEnsure(available.map((label) => label.name))
        const existing = plan.existing.flatMap((name) => {
          const label = findLabelByName(available, name)
          return label === undefined ? [] : [label]
        })
        const created = yield* Effect.forEach(plan.missing, (name) => create(teamId, name))
        return { created, existing }
      })

      return LabelService.of({ list, listAvailable, ensure })
    }),
  )
}

export { Label, LabelCreateError, LabelService, type LabelEnsureResult }
