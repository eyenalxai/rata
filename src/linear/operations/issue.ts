import { Effect } from "effect"

import type { IssueId, TeamId } from "@/domain/id"
import type { IssueRef } from "@/domain/issue-ref"
import type { LinearClientShape } from "@/linear/client"
import type { Connection, PageOptions } from "@/linear/connection"
import type { IssueLabel, IssueSummaryNode } from "@/linear/decode/issue"
import type { IssueWorkingNode } from "@/linear/decode/issue/working-set"
import type { LinearApiError } from "@/linear/errors"
import type { IssueListOptions } from "@/linear/operations/issue/filter"

import { isUuid, issueId } from "@/domain/id"
import {
  collectConnection,
  collectPages,
  lastPageInfo,
  maxPageSize,
  pageOrDrain,
  pageSize,
} from "@/linear/connection"
import { ListResponse, SearchResponse } from "@/linear/decode/collection"
import {
  AttachmentsResponse,
  CommentsResponse,
  IssueIdResponse,
  IssueSummaryResponse,
  IssueTeamResponse,
  LabelsResponse,
} from "@/linear/decode/issue"
import { WorkingChildrenResponse, WorkingSetResponse } from "@/linear/decode/issue/working-set"
import { InverseRelationsResponse, RelationsResponse } from "@/linear/decode/relation"
import {
  attachmentsQuery,
  commentsQuery,
  issueIdQuery,
  issueSummaryQuery,
  issueTeamQuery,
  labelsQuery,
  listQuery,
  prioritySort,
  searchQuery,
  workingChildrenQuery,
  workingSetQuery,
} from "@/linear/documents/issue"
import { inverseRelationsQuery, relationsQuery } from "@/linear/documents/relation"
import { teamIdFilter } from "@/linear/filter"
import { issueFilter } from "@/linear/operations/issue/filter"

type IssueWorkingSetOptions = {
  readonly comments: boolean
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

  const completeWorkingNode = Effect.fn("LinearIssue.completeWorkingNode")(function* completeNode(
    node: IssueWorkingNode,
    options: IssueWorkingSetOptions,
  ) {
    const children = yield* collectPages(node.children, (after) =>
      execute(
        workingChildrenQuery,
        { id: node.id, first: pageSize, after },
        WorkingChildrenResponse,
      ).pipe(Effect.map((data) => data.issue.children)),
    )
    const relations = yield* collectPages(node.relations, (after) =>
      execute(relationsQuery, { id: node.id, first: pageSize, after }, RelationsResponse).pipe(
        Effect.map((data) => data.issue.relations),
      ),
    )
    const inverseRelations = yield* collectPages(node.inverseRelations, (after) =>
      execute(
        inverseRelationsQuery,
        { id: node.id, first: pageSize, after },
        InverseRelationsResponse,
      ).pipe(Effect.map((data) => data.issue.inverseRelations)),
    )
    const attachments = yield* collectPages(node.attachments, (after) =>
      execute(attachmentsQuery, { id: node.id, first: pageSize, after }, AttachmentsResponse).pipe(
        Effect.map((data) => data.issue.attachments),
      ),
    )
    const comments =
      options.comments && node.comments !== undefined
        ? yield* collectPages(node.comments, (after) =>
            execute(commentsQuery, { id: node.id, first: pageSize, after }, CommentsResponse).pipe(
              Effect.map((data) => data.issue.comments),
            ),
          )
        : undefined
    return {
      ...node,
      children: { nodes: children, pageInfo: lastPageInfo },
      relations: { nodes: relations, pageInfo: lastPageInfo },
      inverseRelations: { nodes: inverseRelations, pageInfo: lastPageInfo },
      attachments: { nodes: attachments, pageInfo: lastPageInfo },
      ...(comments === undefined ? {} : { comments: { nodes: comments, pageInfo: lastPageInfo } }),
    }
  })

  const workingSet = Effect.fn("LinearIssue.workingSet")(function* readWorkingSet(
    refs: readonly IssueRef[],
    options: IssueWorkingSetOptions,
  ) {
    const fetchPage = (after: string | null) =>
      execute(
        workingSetQuery({ comments: options.comments }),
        {
          filter: issueFilter({ ids: refs, after, limit: maxPageSize }),
          first: maxPageSize,
          after,
        },
        WorkingSetResponse,
      ).pipe(Effect.map((data) => data.issues))
    const page = yield* pageOrDrain(fetchPage, {
      after: null,
      limit: maxPageSize,
      all: true,
    })
    const nodes = yield* Effect.forEach(page.nodes, (node) => completeWorkingNode(node, options))
    return { nodes, pageInfo: lastPageInfo }
  })

  return { id, labels, list, search, summary, teamId, workingSet }
}

export { makeIssueOperations, type IssueReadOperations }
