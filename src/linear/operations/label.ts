import { Effect, Schema } from "effect"

import type { TeamId } from "@/domain/id"
import type { Label } from "@/domain/label"
import type { LinearClientShape } from "@/linear/client"
import type { Connection, PageOptions } from "@/linear/connection"
import type { LinearApiError } from "@/linear/errors"

import { pageOrDrain } from "@/linear/connection"
import { LabelConnection } from "@/linear/decode/label"
import { listAvailableLabelsQuery, listLabelsQuery } from "@/linear/documents/label"

type LabelReadOperations = {
  readonly list: (
    teamId: TeamId,
    options: PageOptions,
  ) => Effect.Effect<Connection<Label>, LinearApiError>
  readonly listAvailable: (
    teamId: TeamId,
    options: PageOptions,
  ) => Effect.Effect<Connection<Label>, LinearApiError>
}

const makeLabelOperations = (execute: LinearClientShape["execute"]): LabelReadOperations => {
  const list = Effect.fn("LinearLabel.list")(function* listLabels(
    teamId: TeamId,
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

  const listAvailable = Effect.fn("LinearLabel.listAvailable")(function* listAvailableLabels(
    teamId: TeamId,
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

export { makeLabelOperations, type LabelReadOperations }
