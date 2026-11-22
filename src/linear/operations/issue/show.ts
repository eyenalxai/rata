import { Effect } from "effect"

import type { IssueRef } from "@/domain/issue-ref"
import type { RelationTargets } from "@/domain/relation"
import type { LinearClientShape } from "@/linear/client"
import type {
  IssueAttachment,
  IssueChild,
  IssueComment,
  IssueDetailNode,
  IssueLabel,
} from "@/linear/decode/issue"
import type { LinearApiError } from "@/linear/errors"

import { relationTargets } from "@/domain/relation"
import { collectPages, pageSize } from "@/linear/connection"
import {
  AttachmentsResponse,
  ChildrenResponse,
  CommentsResponse,
  LabelsResponse,
  ShowResponse,
} from "@/linear/decode/issue"
import { InverseRelationsResponse, RelationsResponse } from "@/linear/decode/relation"
import {
  attachmentsQuery,
  childrenQuery,
  commentsQuery,
  labelsQuery,
  showQuery,
} from "@/linear/documents/issue"
import { inverseRelationsQuery, relationsQuery } from "@/linear/documents/relation"
import { LinearGraphQLError } from "@/linear/errors"

type IssueShowOptions = {
  readonly comments: boolean
  readonly relations?: boolean | undefined
  readonly children?: boolean | undefined
  readonly attachments?: boolean | undefined
}

type IssueDetailData = Omit<
  IssueDetailNode,
  "labels" | "children" | "relations" | "inverseRelations" | "attachments"
> & {
  readonly labels: readonly IssueLabel[]
  readonly children?: readonly IssueChild[] | undefined
  readonly relations?: RelationTargets<IssueChild> | undefined
  readonly attachments?: readonly IssueAttachment[] | undefined
  readonly comments?: readonly IssueComment[] | undefined
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

const byCreatedAt = (
  left: { readonly createdAt: string },
  right: { readonly createdAt: string },
): number => (left.createdAt < right.createdAt ? -1 : left.createdAt > right.createdAt ? 1 : 0)

const readIssueShow = (
  execute: LinearClientShape["execute"],
  ref: IssueRef,
  options: IssueShowOptions,
): Effect.Effect<IssueDetailData, LinearApiError> =>
  Effect.gen(function* readShow() {
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
      ? relationTargets<IssueChild>(
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
      : relationTargets<IssueChild>([], [])
    const attachments = connections.attachments
      ? yield* collectPages(yield* requireConnection(issue.attachments), (after) =>
          execute(attachmentsQuery, { id: ref, first: pageSize, after }, AttachmentsResponse).pipe(
            Effect.map((page) => page.issue.attachments),
          ),
        )
      : []

    const {
      children: _children,
      relations: _relations,
      inverseRelations: _inverseRelations,
      attachments: _attachments,
      ...rest
    } = issue
    const detail = {
      ...rest,
      labels,
      ...(connections.children ? { children } : {}),
      ...(connections.relations ? { relations } : {}),
      ...(connections.attachments ? { attachments } : {}),
    }
    if (!options.comments) {
      return detail
    }
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
  })

export { type IssueDetailData, type IssueShowOptions, readIssueShow }
