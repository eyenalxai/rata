import { Effect } from "effect"

import type { LinearClient } from "@/api/client"
import type { LinearApiError } from "@/api/errors"
import type { IssueDetail, IssueShowOptions, IssueSummary } from "@/api/issue-model"
import type { InvalidIssueRef } from "@/domain/ref"

import { LinearGraphQLError } from "@/api/errors"
import { byCreatedAt, relationTargets, toSummary } from "@/api/issue-model"
import {
  attachmentsQuery,
  childrenQuery,
  commentsQuery,
  inverseRelationsQuery,
  issueSummaryQuery,
  labelsQuery,
  relationsQuery,
  showQuery,
} from "@/api/issue-query"
import {
  AttachmentsResponse,
  ChildrenResponse,
  CommentsResponse,
  InverseRelationsResponse,
  IssueSummaryResponse,
  LabelsResponse,
  RelationsResponse,
  ShowResponse,
} from "@/api/issue-schema"
import { collectPages, pageSize } from "@/api/pagination"
import { toPriority } from "@/domain/priority"
import { parseRefOrFail } from "@/domain/ref"

type ReadOperations = {
  readonly show: (
    ref: string,
    options: IssueShowOptions,
  ) => Effect.Effect<IssueDetail, LinearApiError | InvalidIssueRef>
  readonly summary: (ref: string) => Effect.Effect<IssueSummary, LinearApiError | InvalidIssueRef>
}

const requireConnection = <A>(value: A | undefined): Effect.Effect<A, LinearApiError> =>
  value === undefined
    ? Effect.fail(
        new LinearGraphQLError({
          message: "Linear returned an unexpected response body.",
          details: [],
        }),
      )
    : Effect.succeed(value)

const makeReadOperations = (execute: LinearClient["Service"]["execute"]): ReadOperations => {
  const summary = Effect.fn("IssueApi.summary")(function* summary(input: string) {
    const ref = yield* parseRefOrFail(input)
    const data = yield* execute(issueSummaryQuery, { id: ref }, IssueSummaryResponse)
    return toSummary(data.issue)
  })

  const show = Effect.fn("IssueApi.show")(function* show(input: string, options: IssueShowOptions) {
    const ref = yield* parseRefOrFail(input)
    const connections = {
      children: options.children !== false,
      relations: options.relations !== false,
      attachments: options.attachments !== false,
    }
    const data = yield* execute(showQuery(connections), { id: ref }, ShowResponse)
    const issue = data.issue

    const labels = yield* collectPages(issue.labels, (after) =>
      execute(labelsQuery, { id: ref, first: pageSize, after }, LabelsResponse).pipe(
        Effect.map((page) => page.issue.labels),
      ),
    )
    const children = connections.children
      ? yield* collectPages(yield* requireConnection(issue.children), (after) =>
          execute(childrenQuery, { id: ref, first: pageSize, after }, ChildrenResponse).pipe(
            Effect.map((page) => page.issue.children),
          ),
        )
      : []
    const relations = connections.relations
      ? relationTargets(
          yield* collectPages(yield* requireConnection(issue.relations), (after) =>
            execute(relationsQuery, { id: ref, first: pageSize, after }, RelationsResponse).pipe(
              Effect.map((page) => page.issue.relations),
            ),
          ),
          yield* collectPages(yield* requireConnection(issue.inverseRelations), (after) =>
            execute(
              inverseRelationsQuery,
              { id: ref, first: pageSize, after },
              InverseRelationsResponse,
            ).pipe(Effect.map((page) => page.issue.inverseRelations)),
          ),
        )
      : relationTargets([], [])
    const attachments = connections.attachments
      ? yield* collectPages(yield* requireConnection(issue.attachments), (after) =>
          execute(attachmentsQuery, { id: ref, first: pageSize, after }, AttachmentsResponse).pipe(
            Effect.map((page) => page.issue.attachments),
          ),
        )
      : []

    const detail: IssueDetail = {
      id: issue.id,
      identifier: issue.identifier,
      title: issue.title,
      description: issue.description,
      url: issue.url,
      state: issue.state,
      priority: toPriority(issue.priority),
      updatedAt: issue.updatedAt,
      assignee: issue.assignee,
      project: issue.project,
      parent: issue.parent,
      team: issue.team,
      labels,
      children,
      relations,
      attachments,
    }

    if (options.comments) {
      const firstComments = yield* execute(
        commentsQuery,
        { id: ref, first: pageSize, after: null },
        CommentsResponse,
      )
      const comments = yield* collectPages(firstComments.issue.comments, (after) =>
        execute(commentsQuery, { id: ref, first: pageSize, after }, CommentsResponse).pipe(
          Effect.map((page) => page.issue.comments),
        ),
      )
      return { ...detail, comments: comments.toSorted(byCreatedAt) }
    }
    return detail
  })

  return { show, summary }
}

export { makeReadOperations, type ReadOperations }
