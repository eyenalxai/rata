import { Effect } from "effect"

import type { IssueId, TeamId } from "@/domain/id"
import type { IssueRef } from "@/domain/issue-ref"
import type { LinearClientShape } from "@/linear/client"
import type { Connection, PageOptions } from "@/linear/connection"
import type { IssueSummaryNode } from "@/linear/decode/issue"
import type { LinearApiError } from "@/linear/errors"
import type { IssueListOptions, IssueSort } from "@/linear/operations/issue/filter"
import type { IssueDetailData, IssueShowOptions } from "@/linear/operations/issue/show"

import { isUuid, issueId } from "@/domain/id"
import { pageOrDrain } from "@/linear/connection"
import { ListResponse, SearchResponse } from "@/linear/decode/collection"
import { IssueIdResponse, IssueSummaryResponse } from "@/linear/decode/issue"
import {
  issueIdQuery,
  issueSummaryQuery,
  listQuery,
  prioritySort,
  searchQuery,
} from "@/linear/documents/issue"
import { teamIdFilter } from "@/linear/filter"
import { issueFilter } from "@/linear/operations/issue/filter"
import { readIssueShow } from "@/linear/operations/issue/show"

type IssueReadOperations = {
  readonly id: (ref: IssueRef) => Effect.Effect<IssueId, LinearApiError>
  readonly list: (
    options: IssueListOptions,
  ) => Effect.Effect<Connection<IssueSummaryNode>, LinearApiError>
  readonly search: (
    term: string,
    options: PageOptions & { readonly teamId: TeamId },
  ) => Effect.Effect<Connection<IssueSummaryNode>, LinearApiError>
  readonly show: (
    ref: IssueRef,
    options: IssueShowOptions,
  ) => Effect.Effect<IssueDetailData, LinearApiError>
  readonly summary: (ref: IssueRef) => Effect.Effect<IssueSummaryNode, LinearApiError>
}

const makeIssueOperations = (execute: LinearClientShape["execute"]): IssueReadOperations => {
  const id = Effect.fn("LinearIssue.id")(function* resolveId(ref: IssueRef) {
    if (isUuid(ref)) {
      return issueId(ref)
    }
    const data = yield* execute(issueIdQuery, { id: ref }, IssueIdResponse)
    return data.issue.id
  })

  const summary = Effect.fn("LinearIssue.summary")(function* readSummary(ref: IssueRef) {
    const data = yield* execute(issueSummaryQuery, { id: ref }, IssueSummaryResponse)
    return data.issue
  })

  const show = Effect.fn("LinearIssue.show")(function* readShow(
    ref: IssueRef,
    options: IssueShowOptions,
  ) {
    return yield* readIssueShow(execute, ref, options)
  })

  const list = Effect.fn("LinearIssue.list")(function* listIssues(options: IssueListOptions) {
    const sort = options.sort === undefined ? undefined : prioritySort
    const query = listQuery({
      relations: options.include === "relations",
      sort: sort !== undefined,
    })
    const variables = (first: number, after: string | null) => ({
      filter: issueFilter(options),
      first,
      after,
      ...(sort === undefined ? {} : { sort }),
    })
    const fetchPage = (after: string | null) =>
      execute(query, variables(options.limit, after), ListResponse).pipe(
        Effect.map((data) => data.issues),
      )
    return yield* pageOrDrain(fetchPage, options)
  })

  const search = Effect.fn("LinearIssue.search")(function* searchIssues(
    term: string,
    options: PageOptions & { readonly teamId: TeamId },
  ) {
    const fetchPage = (after: string | null) =>
      execute(
        searchQuery,
        { term, filter: teamIdFilter(options.teamId), first: options.limit, after },
        SearchResponse,
      ).pipe(Effect.map((data) => data.searchIssues))
    return yield* pageOrDrain(fetchPage, options)
  })

  return { id, list, search, show, summary }
}

export {
  type IssueDetailData,
  type IssueListOptions,
  type IssueReadOperations,
  type IssueShowOptions,
  type IssueSort,
  makeIssueOperations,
}
