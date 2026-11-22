import { Effect } from "effect"

import type { IssueId, TeamId } from "@/domain/id"
import type { IssueRef } from "@/domain/issue-ref"
import type { LinearClientShape } from "@/linear/client"
import type { Connection, PageOptions } from "@/linear/connection"
import type {
  IssueAttachment,
  IssueComment,
  IssueLabel,
  IssueSummaryNode,
} from "@/linear/decode/issue"
import type { IssueWorkingNode } from "@/linear/decode/issue/working-set"
import type { LinearApiError } from "@/linear/errors"
import type { IssueListOptions } from "@/linear/operations/issue/filter"

import { isUuid, issueId } from "@/domain/id"
import { collectConnection, lastPageInfo, pageOrDrain, pageSize } from "@/linear/connection"
import { ListResponse, SearchResponse } from "@/linear/decode/collection"
import {
  IssueIdResponse,
  IssueSummaryResponse,
  IssueTeamResponse,
  LabelsResponse,
} from "@/linear/decode/issue"
import {
  WorkingAttachmentsPageResponse,
  WorkingCommentsPageResponse,
  WorkingSetResponse,
  WorkingSummaryResponse,
} from "@/linear/decode/issue/working-set"
import {
  issueIdQuery,
  issueSummaryQuery,
  issueTeamQuery,
  labelsQuery,
  listQuery,
  prioritySort,
  searchQuery,
  workingAttachmentsPageQuery,
  workingCommentsPageQuery,
  workingSetQuery,
  workingSummaryQuery,
} from "@/linear/documents/issue"
import { workingLimits } from "@/linear/documents/issue/fields"
import { LinearGraphQLError } from "@/linear/errors"
import { teamIdFilter } from "@/linear/filter"
import { issueFilter } from "@/linear/operations/issue/filter"

type IssueReadMode = "summary" | "working" | "full"

type IssueWorkingSetOptions = {
  readonly comments: boolean
  readonly mode: IssueReadMode
}

type IssueReadOperations = {
  readonly id: (ref: IssueRef) => Effect.Effect<IssueId, LinearApiError>
  readonly list: (
    options: IssueListOptions,
  ) => Effect.Effect<Connection<IssueSummaryNode>, LinearApiError>
  readonly search: (
    term: string,
    options: PageOptions & { readonly teamId: TeamId },
  ) => Effect.Effect<Connection<IssueSummaryNode>, LinearApiError>
  readonly summary: (ref: IssueRef) => Effect.Effect<IssueSummaryNode, LinearApiError>
  readonly workingSet: (
    refs: readonly IssueRef[],
    options: IssueWorkingSetOptions,
  ) => Effect.Effect<Connection<IssueWorkingNode>, LinearApiError>
  readonly labels: (ref: IssueRef | IssueId) => Effect.Effect<readonly IssueLabel[], LinearApiError>
  readonly teamId: (issueId: IssueId) => Effect.Effect<TeamId, LinearApiError>
}

const pendingById = (
  nodes: readonly IssueWorkingNode[],
  pageInfoOf: (
    node: IssueWorkingNode,
  ) => { readonly hasNextPage: boolean; readonly endCursor: string | null } | undefined,
): readonly { readonly id: IssueId; readonly cursor: string }[] =>
  nodes.flatMap((node) => {
    const pageInfo = pageInfoOf(node)
    return pageInfo?.hasNextPage === true && pageInfo.endCursor !== null
      ? [{ id: node.id, cursor: pageInfo.endCursor }]
      : []
  })

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

  const teamId = Effect.fn("LinearIssue.teamId")(function* readTeamId(refId: IssueId) {
    const data = yield* execute(issueTeamQuery, { id: refId }, IssueTeamResponse)
    return data.issue.team.id
  })

  const labels = Effect.fn("LinearIssue.labels")(function* readLabels(ref: IssueRef | IssueId) {
    return yield* collectConnection((after) =>
      execute(labelsQuery, { id: ref, first: pageSize, after }, LabelsResponse).pipe(
        Effect.map((data) => data.issue.labels),
      ),
    )
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

  const completeAttachments = Effect.fn("LinearIssue.completeAttachments")(
    function* completeWorkingAttachments(nodes: readonly IssueWorkingNode[]) {
      const extra = new Map<IssueId, IssueAttachment[]>()
      for (const node of nodes) {
        if (node.attachments !== undefined) {
          extra.set(node.id, [...node.attachments.nodes])
        }
      }
      let pending = pendingById(nodes, (node) => node.attachments?.pageInfo)
      while (pending.length > 0) {
        const variables: Record<string, string> = {}
        for (const [index, item] of pending.entries()) {
          variables[`id${index}`] = item.id
          variables[`after${index}`] = item.cursor
        }
        const data = yield* execute(
          workingAttachmentsPageQuery(pending.length, workingLimits.attachments),
          variables,
          WorkingAttachmentsPageResponse,
        )
        const next: { readonly id: IssueId; readonly cursor: string }[] = []
        for (const [index, item] of pending.entries()) {
          const page = data[`issue${index}`]?.attachments
          if (page === undefined) {
            return yield* new LinearGraphQLError({
              message: "Linear returned an unexpected response body.",
              details: [],
            })
          }
          extra.get(item.id)?.push(...page.nodes)
          if (page.pageInfo.hasNextPage && page.pageInfo.endCursor !== null) {
            next.push({ id: item.id, cursor: page.pageInfo.endCursor })
          }
        }
        pending = next
      }
      return nodes.map((node) => {
        const attachments = extra.get(node.id)
        return node.attachments === undefined || attachments === undefined
          ? node
          : { ...node, attachments: { nodes: attachments, pageInfo: lastPageInfo } }
      })
    },
  )

  const completeComments = Effect.fn("LinearIssue.completeComments")(
    function* completeWorkingComments(nodes: readonly IssueWorkingNode[]) {
      const extra = new Map<IssueId, IssueComment[]>()
      for (const node of nodes) {
        if (node.comments !== undefined) {
          extra.set(node.id, [...node.comments.nodes])
        }
      }
      let pending = pendingById(nodes, (node) => node.comments?.pageInfo)
      while (pending.length > 0) {
        const variables: Record<string, string> = {}
        for (const [index, item] of pending.entries()) {
          variables[`id${index}`] = item.id
          variables[`after${index}`] = item.cursor
        }
        const data = yield* execute(
          workingCommentsPageQuery(pending.length, workingLimits.comments),
          variables,
          WorkingCommentsPageResponse,
        )
        const next: { readonly id: IssueId; readonly cursor: string }[] = []
        for (const [index, item] of pending.entries()) {
          const page = data[`issue${index}`]?.comments
          if (page === undefined) {
            return yield* new LinearGraphQLError({
              message: "Linear returned an unexpected response body.",
              details: [],
            })
          }
          extra.get(item.id)?.push(...page.nodes)
          if (page.pageInfo.hasNextPage && page.pageInfo.endCursor !== null) {
            next.push({ id: item.id, cursor: page.pageInfo.endCursor })
          }
        }
        pending = next
      }
      return nodes.map((node) => {
        const comments = extra.get(node.id)
        return node.comments === undefined || comments === undefined
          ? node
          : { ...node, comments: { nodes: comments, pageInfo: lastPageInfo } }
      })
    },
  )

  const workingSet = Effect.fn("LinearIssue.workingSet")(function* readWorkingSet(
    refs: readonly IssueRef[],
    options: IssueWorkingSetOptions,
  ) {
    const batch = workingLimits.batch[options.mode]
    const decoder = options.mode === "summary" ? WorkingSummaryResponse : WorkingSetResponse
    const query =
      options.mode === "summary"
        ? workingSummaryQuery
        : workingSetQuery({ comments: options.comments, full: options.mode === "full" })
    const fetchPage = (after: string | null) =>
      execute(
        query,
        {
          filter: issueFilter({ ids: refs, after, limit: batch }),
          first: batch,
          after,
        },
        decoder,
      ).pipe(Effect.map((data) => data.issues))
    const page: Connection<IssueWorkingNode> = yield* pageOrDrain(fetchPage, {
      after: null,
      limit: batch,
      all: true,
    })
    if (options.mode === "summary") {
      return page
    }
    const withAttachments = yield* completeAttachments(page.nodes)
    const nodes = options.comments ? yield* completeComments(withAttachments) : withAttachments
    return { nodes, pageInfo: page.pageInfo }
  })

  return { id, labels, list, search, summary, teamId, workingSet }
}

export { makeIssueOperations, type IssueReadOperations, type IssueReadMode }
