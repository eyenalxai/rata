import { Context, Effect, Layer } from "effect"

import type { LinearApiError } from "@/api/errors"
import type {
  IssueDetail,
  IssueListOptions,
  IssuePage,
  IssueSearchOptions,
  IssueShowOptions,
  IssueStatus,
  IssueStatusOptions,
  IssueSummary,
} from "@/api/issue-model"
import type { IssueRefNotFoundError } from "@/api/issue/batch"
import type {
  AssigneeInputError,
  AssigneeNotFoundError,
  FilterNameNotFoundError,
} from "@/api/issue/filter-check"
import type { TeamNotFoundError, TeamResolutionError } from "@/api/team"
import type { RepoConfigError } from "@/config/repo"
import type { InvalidIssueRef } from "@/domain/ref"

import { LinearClient } from "@/api/client"
import { composeFilter, projectFilter, teamIdFilter, textFilter } from "@/api/issue-filter"
import { collectsAllPages, sortAndLimitNodes, toSummary } from "@/api/issue-model"
import { issueIdQuery, listQuery, searchQuery } from "@/api/issue-query"
import { IssueIdResponse } from "@/api/issue-schema"
import { ListResponse, SearchResponse } from "@/api/issue-schema/collection"
import { parseBatchRefs, requireBatchRefs } from "@/api/issue/batch"
import { resolveAssignee, validateNamedFilters } from "@/api/issue/filter-check"
import { makeReadOperations } from "@/api/issue/read"
import { toIssueStatus } from "@/api/issue/status"
import { collectPages, lastPageInfo, maxPageSize, pageOrDrain, pageSize } from "@/api/pagination"
import { RepoTeam } from "@/api/repo-team"
import { isUuid, parseRefOrFail } from "@/domain/ref"
import { closedStateTypes } from "@/domain/state"

type IssueListError =
  | LinearApiError
  | InvalidIssueRef
  | RepoConfigError
  | TeamNotFoundError
  | TeamResolutionError
  | FilterNameNotFoundError
  | AssigneeInputError
  | AssigneeNotFoundError
  | IssueRefNotFoundError

type IssueApiShape = {
  readonly list: (options: IssueListOptions) => Effect.Effect<IssuePage, IssueListError>
  readonly search: (
    term: string,
    options: IssueSearchOptions,
  ) => Effect.Effect<
    IssuePage,
    LinearApiError | RepoConfigError | TeamNotFoundError | TeamResolutionError
  >
  readonly show: (
    ref: string,
    options: IssueShowOptions,
  ) => Effect.Effect<IssueDetail, LinearApiError | InvalidIssueRef>
  readonly summary: (ref: string) => Effect.Effect<IssueSummary, LinearApiError | InvalidIssueRef>
  readonly status: (
    ref: string,
    options: IssueStatusOptions,
  ) => Effect.Effect<IssueStatus, IssueListError>
}

const projectRefFilter = (value: string): Record<string, unknown> =>
  isUuid(value) ? { project: { id: { eq: value } } } : projectFilter(value)

class IssueApi extends Context.Service<IssueApi, IssueApiShape>()("rata-cli/api/issue/IssueApi") {
  static readonly layer = Layer.effect(
    IssueApi,
    Effect.gen(function* issueApiLayer() {
      const client = yield* LinearClient
      const repoTeam = yield* RepoTeam
      const { show, summary } = makeReadOperations(client.execute)

      const resolveAssigneeId = (
        value: string,
      ): Effect.Effect<string, LinearApiError | AssigneeInputError | AssigneeNotFoundError> =>
        value.toLowerCase() === "me"
          ? client.viewer.pipe(Effect.map((viewer) => viewer.id))
          : resolveAssignee(client.execute, value)

      const resolveIssueId = Effect.fn("IssueApi.resolveIssueId")(function* resolveIssueId(
        input: string,
      ) {
        const ref = yield* parseRefOrFail(input)
        if (isUuid(ref)) {
          return ref
        }
        const data = yield* client.execute(issueIdQuery, { id: ref }, IssueIdResponse)
        return data.issue.id
      })

      const list = Effect.fn("IssueApi.list")(function* list(options: IssueListOptions) {
        const requested = options.ids === undefined ? undefined : yield* parseBatchRefs(options.ids)
        const teamId =
          requested !== undefined && options.team === undefined
            ? undefined
            : yield* repoTeam.resolve(options.team)
        const parts: Record<string, unknown>[] = []
        if (teamId !== undefined) {
          parts.push(teamIdFilter(teamId))
        }
        if (options.state !== undefined) {
          parts.push({ state: { name: { eqIgnoreCase: options.state } } })
        }
        if (options.stateType !== undefined) {
          parts.push({ state: { type: { eq: options.stateType } } })
        }
        if (options.priority !== undefined) {
          parts.push({ priority: { eq: options.priority } })
        }
        if (options.label !== undefined) {
          parts.push({ labels: { some: { name: { eqIgnoreCase: options.label } } } })
        }
        if (options.assignee !== undefined) {
          const assigneeId = yield* resolveAssigneeId(options.assignee)
          parts.push({ assignee: { id: { eq: assigneeId } } })
        }
        if (options.unassigned === true) {
          parts.push({ assignee: { null: true } })
        }
        if (options.project !== undefined) {
          parts.push(projectRefFilter(options.project))
        }
        if (options.parent !== undefined) {
          const parentId = yield* resolveIssueId(options.parent)
          parts.push({ parent: { id: { eq: parentId } } })
        }
        if (options.text !== undefined) {
          parts.push(textFilter(options.text))
        }
        if (options.unblocked === true) {
          parts.push(
            { hasBlockedByRelations: { eq: false } },
            { state: { type: { nin: closedStateTypes } } },
          )
        }
        if (requested !== undefined) {
          parts.push({ id: { in: requested } })
        }
        const filter = composeFilter(parts)
        const query = listQuery(options.include === "relations")
        const checkNames = (page: IssuePage) =>
          page.issues.length === 0 && teamId !== undefined
            ? validateNamedFilters(client.execute, teamId, options).pipe(Effect.map(() => page))
            : Effect.succeed(page)
        const complete = (page: IssuePage, nodes: readonly IssueSummary[], whole: boolean) =>
          requested === undefined || !whole
            ? checkNames(page)
            : requireBatchRefs(requested, nodes).pipe(Effect.andThen(checkNames(page)))

        if (!collectsAllPages(options)) {
          const data = yield* client.execute(
            query,
            { filter, first: options.limit, after: options.after },
            ListResponse,
          )
          const issues = data.issues.nodes.map(toSummary)
          return yield* complete(
            { issues, pageInfo: data.issues.pageInfo },
            issues,
            options.after === null && !data.issues.pageInfo.hasNextPage,
          )
        }

        const size = options.all === true ? options.limit : pageSize
        const firstPage = yield* client.execute(
          query,
          { filter, first: size, after: options.after },
          ListResponse,
        )
        const nodes = yield* collectPages(firstPage.issues, (after) =>
          client
            .execute(query, { filter, first: size, after }, ListResponse)
            .pipe(Effect.map((page) => page.issues)),
        )
        return yield* complete(
          {
            issues: sortAndLimitNodes(nodes, options).map(toSummary),
            pageInfo: lastPageInfo,
          },
          nodes.map(toSummary),
          options.after === null,
        )
      })

      const search = Effect.fn("IssueApi.search")(function* search(
        term: string,
        options: IssueSearchOptions,
      ) {
        const teamId = yield* repoTeam.resolve(options.team)
        const fetchPage = (after: string | null) =>
          client
            .execute(
              searchQuery,
              {
                term,
                filter: teamIdFilter(teamId),
                first: options.limit,
                after,
              },
              SearchResponse,
            )
            .pipe(Effect.map((data) => data.searchIssues))
        const page = yield* pageOrDrain(fetchPage, options)
        return {
          issues: page.nodes.map(toSummary),
          pageInfo: page.pageInfo,
        }
      })

      const status = Effect.fn("IssueApi.status")(function* status(
        input: string,
        options: IssueStatusOptions,
      ) {
        const issue = yield* show(input, {
          comments: options.comments === true,
          children: false,
        })
        const children =
          options.children === true
            ? yield* list({
                team: issue.team.id,
                parent: issue.id,
                include: "relations",
                sort: "priority",
                after: null,
                limit: maxPageSize,
                all: true,
              })
            : yield* list({
                team: issue.team.id,
                parent: issue.id,
                unblocked: true,
                sort: "priority",
                after: null,
                limit: 1,
              })
        return toIssueStatus(issue, children.issues, options)
      })

      return IssueApi.of({ list, search, show, status, summary })
    }),
  )
}

export { IssueApi }
