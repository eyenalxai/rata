import { Context, Effect, Layer } from "effect"

import type { LinearApiError } from "@/api/errors"
import type {
  IssueDetail,
  IssueListOptions,
  IssuePage,
  IssueSearchOptions,
  IssueShowOptions,
  IssueSummary,
} from "@/api/issue-model"
import type { TeamNotFoundError, TeamResolutionError } from "@/api/team"
import type { RepoConfigError } from "@/config/repo"
import type { InvalidIssueRef } from "@/domain/ref"

import { LinearClient } from "@/api/client"
import { composeFilter, projectFilter, teamIdFilter, textFilter } from "@/api/issue-filter"
import { collectsAllPages, sortAndLimitNodes, toSummary } from "@/api/issue-model"
import { issueIdQuery, listQuery, searchQuery } from "@/api/issue-query"
import { IssueIdResponse, ListResponse, SearchResponse } from "@/api/issue-schema"
import { makeReadOperations } from "@/api/issue/read"
import { collectPages, lastPageInfo, pageOrDrain, pageSize } from "@/api/pagination"
import { RepoTeam } from "@/api/repo-team"
import { isUuid, parseRefOrFail } from "@/domain/ref"
import { closedStateTypes } from "@/domain/state"

type IssueApiShape = {
  readonly list: (
    options: IssueListOptions,
  ) => Effect.Effect<
    IssuePage,
    LinearApiError | InvalidIssueRef | RepoConfigError | TeamNotFoundError | TeamResolutionError
  >
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

      const resolveAssignee = (value: string): Effect.Effect<string, LinearApiError> =>
        value.toLowerCase() === "me"
          ? client.viewer.pipe(Effect.map((viewer) => viewer.id))
          : Effect.succeed(value)

      const resolveIssueId = Effect.fn("IssueApi.resolveIssueId")(function* resolveIssueId(
        input: string,
      ) {
        const ref = yield* parseRefOrFail(input)
        const data = yield* client.execute(issueIdQuery, { id: ref }, IssueIdResponse)
        return data.issue.id
      })

      const list = Effect.fn("IssueApi.list")(function* list(options: IssueListOptions) {
        const teamId = yield* repoTeam.resolve(options.team)
        const parts: Record<string, unknown>[] = [teamIdFilter(teamId)]
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
          const assigneeId = yield* resolveAssignee(options.assignee)
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
        const filter = composeFilter(parts)

        if (!collectsAllPages(options)) {
          const data = yield* client.execute(
            listQuery,
            { filter, first: options.limit, after: options.after },
            ListResponse,
          )
          return { issues: data.issues.nodes.map(toSummary), pageInfo: data.issues.pageInfo }
        }

        const size = options.all === true ? options.limit : pageSize
        const firstPage = yield* client.execute(
          listQuery,
          { filter, first: size, after: options.after },
          ListResponse,
        )
        const nodes = yield* collectPages(firstPage.issues, (after) =>
          client
            .execute(listQuery, { filter, first: size, after }, ListResponse)
            .pipe(Effect.map((page) => page.issues)),
        )
        return {
          issues: sortAndLimitNodes(nodes, options).map(toSummary),
          pageInfo: lastPageInfo,
        }
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

      return IssueApi.of({ list, search, show, summary })
    }),
  )
}

export { IssueApi }
