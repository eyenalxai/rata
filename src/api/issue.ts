import { Context, Effect, Layer } from "effect"

import type { LinearApiError } from "@/api/errors"
import type { IssueDetail, IssueListOptions, IssuePage, IssueShowOptions } from "@/api/issue-model"
import type { PageOptions } from "@/api/pagination"
import type { InvalidIssueRef, IssueRef } from "@/domain/ref"

import { LinearClient } from "@/api/client"
import { composeFilter, projectFilter, teamFilter, textFilter } from "@/api/issue-filter"
import { byCreatedAt, relationTargets, toSummary } from "@/api/issue-model"
import {
  childrenQuery,
  commentsQuery,
  inverseRelationsQuery,
  issueIdQuery,
  labelsQuery,
  listQuery,
  relationsQuery,
  searchQuery,
  showQuery,
} from "@/api/issue-query"
import {
  ChildrenResponse,
  CommentsResponse,
  InverseRelationsResponse,
  IssueIdResponse,
  LabelsResponse,
  ListResponse,
  RelationsResponse,
  SearchResponse,
  ShowResponse,
} from "@/api/issue-schema"
import { collectPages, pageSize } from "@/api/pagination"
import { isUuid, parseIssueRef } from "@/domain/ref"

type IssueApiShape = {
  readonly list: (
    options: IssueListOptions,
  ) => Effect.Effect<IssuePage, LinearApiError | InvalidIssueRef>
  readonly search: (term: string, options: PageOptions) => Effect.Effect<IssuePage, LinearApiError>
  readonly show: (
    ref: string,
    options: IssueShowOptions,
  ) => Effect.Effect<IssueDetail, LinearApiError | InvalidIssueRef>
}

const parseRefOrFail = (input: string): Effect.Effect<IssueRef, InvalidIssueRef> =>
  Effect.fromResult(parseIssueRef(input))

const teamRefFilter = (value: string): Record<string, unknown> =>
  isUuid(value) ? { team: { id: { eq: value } } } : teamFilter(value)

const projectRefFilter = (value: string): Record<string, unknown> =>
  isUuid(value) ? { project: { id: { eq: value } } } : projectFilter(value)

class IssueApi extends Context.Service<IssueApi, IssueApiShape>()("rata-cli/api/issue/IssueApi") {
  static readonly layer = Layer.effect(
    IssueApi,
    Effect.gen(function* issueApiLayer() {
      const client = yield* LinearClient

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
        const parts: Record<string, unknown>[] = []
        if (options.team !== undefined) {
          parts.push(teamRefFilter(options.team))
        }
        if (options.state !== undefined) {
          parts.push({ state: { name: { eqIgnoreCase: options.state } } })
        }
        if (options.stateType !== undefined) {
          parts.push({ state: { type: { eq: options.stateType } } })
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
            { state: { type: { nin: ["completed", "canceled"] } } },
          )
        }
        const filter = composeFilter(parts)

        const data = yield* client.execute(
          listQuery,
          { filter, first: options.limit, after: options.after },
          ListResponse,
        )
        return { issues: data.issues.nodes.map(toSummary), pageInfo: data.issues.pageInfo }
      })

      const search = Effect.fn("IssueApi.search")(function* search(
        term: string,
        options: PageOptions,
      ) {
        const data = yield* client.execute(
          searchQuery,
          { term, first: options.limit, after: options.after },
          SearchResponse,
        )
        return {
          issues: data.searchIssues.nodes.map(toSummary),
          pageInfo: data.searchIssues.pageInfo,
        }
      })

      const show = Effect.fn("IssueApi.show")(function* show(
        input: string,
        options: IssueShowOptions,
      ) {
        const ref = yield* parseRefOrFail(input)
        const data = yield* client.execute(showQuery, { id: ref }, ShowResponse)
        const issue = data.issue

        const labels = yield* collectPages(issue.labels, (after) =>
          client
            .execute(labelsQuery, { id: ref, first: pageSize, after }, LabelsResponse)
            .pipe(Effect.map((page) => page.issue.labels)),
        )
        const children = yield* collectPages(issue.children, (after) =>
          client
            .execute(childrenQuery, { id: ref, first: pageSize, after }, ChildrenResponse)
            .pipe(Effect.map((page) => page.issue.children)),
        )
        const relations = yield* collectPages(issue.relations, (after) =>
          client
            .execute(relationsQuery, { id: ref, first: pageSize, after }, RelationsResponse)
            .pipe(Effect.map((page) => page.issue.relations)),
        )
        const inverseRelations = yield* collectPages(issue.inverseRelations, (after) =>
          client
            .execute(
              inverseRelationsQuery,
              { id: ref, first: pageSize, after },
              InverseRelationsResponse,
            )
            .pipe(Effect.map((page) => page.issue.inverseRelations)),
        )

        const detail: IssueDetail = {
          id: issue.id,
          identifier: issue.identifier,
          title: issue.title,
          description: issue.description,
          url: issue.url,
          state: issue.state,
          assignee: issue.assignee,
          project: issue.project,
          parent: issue.parent,
          team: issue.team,
          labels,
          children,
          relations: relationTargets(relations, inverseRelations),
        }

        if (options.comments) {
          const firstComments = yield* client.execute(
            commentsQuery,
            { id: ref, first: pageSize, after: null },
            CommentsResponse,
          )
          const comments = yield* collectPages(firstComments.issue.comments, (after) =>
            client
              .execute(commentsQuery, { id: ref, first: pageSize, after }, CommentsResponse)
              .pipe(Effect.map((page) => page.issue.comments)),
          )
          return { ...detail, comments: comments.toSorted(byCreatedAt) }
        }
        return detail
      })

      return IssueApi.of({ list, search, show })
    }),
  )
}

export { IssueApi }
