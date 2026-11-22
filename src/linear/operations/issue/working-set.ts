import { Effect } from "effect"

import type { IssueRef } from "@/domain/issue-ref"
import type { LinearClientShape } from "@/linear/client"
import type { LinearApiError } from "@/linear/errors"
import type {
  IssueReadConnection,
  IssueWorkingSetOptions,
} from "@/linear/operations/issue/working-set/model"

import { pageOrDrain } from "@/linear/connection"
import {
  FullWorkingSetResponse,
  WorkingSetResponse,
  WorkingSummaryResponse,
} from "@/linear/decode/issue/working-set"
import { workingSetQuery, workingSummaryQuery } from "@/linear/documents/issue"
import { workingLimits } from "@/linear/documents/issue/fields"
import { issueFilter } from "@/linear/operations/issue/filter"
import { makeWorkingSetDrains } from "@/linear/operations/issue/working-set/drain"
import { makeWorkingSetFetchers } from "@/linear/operations/issue/working-set/fetch"

const makeWorkingSetOperation =
  (execute: LinearClientShape["execute"]) =>
  (
    refs: readonly IssueRef[],
    options: IssueWorkingSetOptions,
  ): Effect.Effect<IssueReadConnection, LinearApiError> => {
    const drains = makeWorkingSetDrains(makeWorkingSetFetchers(execute))
    const batch = workingLimits.batch[options.mode]
    const variables = (after: string | null) => ({
      filter: issueFilter({ ids: refs, after, limit: batch }),
      first: batch,
      after,
    })
    if (options.mode === "summary") {
      const fetchPage = (after: string | null) =>
        execute(workingSummaryQuery, variables(after), WorkingSummaryResponse).pipe(
          Effect.map((data) => data.issues),
        )
      return Effect.gen(function* readSummary() {
        const page = yield* pageOrDrain(fetchPage, { after: null, limit: batch, all: true })
        const nodes = yield* drains.drainSummaryNodes(page.nodes)
        return { mode: "summary" as const, nodes, pageInfo: page.pageInfo }
      })
    }
    if (options.mode === "full") {
      const fetchPage = (after: string | null) =>
        execute(
          workingSetQuery({ comments: options.comments, full: true }),
          variables(after),
          FullWorkingSetResponse,
        ).pipe(Effect.map((data) => data.issues))
      return Effect.gen(function* readFull() {
        const page = yield* pageOrDrain(fetchPage, { after: null, limit: batch, all: true })
        const nodes = yield* drains.drainFullWorkingNodes(page.nodes, options.comments)
        return { mode: "full" as const, nodes, pageInfo: page.pageInfo }
      })
    }
    const fetchPage = (after: string | null) =>
      execute(
        workingSetQuery({ comments: options.comments, full: false }),
        variables(after),
        WorkingSetResponse,
      ).pipe(Effect.map((data) => data.issues))
    return Effect.gen(function* readWorking() {
      const page = yield* pageOrDrain(fetchPage, { after: null, limit: batch, all: true })
      const nodes = yield* drains.drainWorkingNodes(page.nodes, options.comments)
      return { mode: "working" as const, nodes, pageInfo: page.pageInfo }
    })
  }

export { type IssueReadConnection, type IssueWorkingSetOptions, makeWorkingSetOperation }
