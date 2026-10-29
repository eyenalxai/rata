import { Effect, Option, Result } from "effect"

import type { LinearClient } from "@/api/client"
import type { IssueComment } from "@/api/issue-schema"
import type { IssueWriteApiError } from "@/api/issue-write/model"
import type { makeIssueWriteResolvers } from "@/api/issue-write/resolvers"
import type { makeVisibilityChecks } from "@/api/issue-write/visibility"
import type {
  CommentCreateOptions,
  CommentCreatePlan,
  CommentCreateResult,
  CommentDeletePlan,
  CommentDeleteResult,
  CommentUpdateOptions,
  CommentUpdateResult,
} from "@/api/issue-write/write-types"

import {
  commentByIdQuery,
  createCommentMutation,
  deleteCommentMutation,
  updateCommentMutation,
} from "@/api/issue-query"
import {
  CommentByIdResponse,
  CreateCommentResponse,
  DeleteCommentResponse,
  UpdateCommentResponse,
} from "@/api/issue-schema"
import { CommentNotFoundError, unwrapComment, unwrapDelete } from "@/api/issue-write/model"
import { unifiedDiff } from "@/domain/body/diff"
import { dedupeCommentId } from "@/domain/comment"

type CommentDependencies = {
  readonly client: LinearClient["Service"]
  readonly resolvers: ReturnType<typeof makeIssueWriteResolvers>
  readonly visibility: ReturnType<typeof makeVisibilityChecks>
}

const missingComment = (commentId: string): CommentNotFoundError =>
  new CommentNotFoundError({
    id: commentId,
    message: `No comment ${commentId}.`,
  })

const createChanges = (
  body: string,
  options: CommentCreateOptions,
  id: string | undefined,
): Readonly<Record<string, unknown>> => ({
  body,
  ...(options.dedupeKey === undefined ? {} : { dedupeKey: options.dedupeKey }),
  ...(id === undefined ? {} : { commentId: id }),
})

const makeCommentWrites = ({ client, resolvers, visibility }: CommentDependencies) => {
  const findComment = Effect.fn("IssueWriteApi.findComment")(function* findComment(
    commentId: string,
  ): Effect.fn.Return<Option.Option<IssueComment>, IssueWriteApiError> {
    const data = yield* client.execute(
      commentByIdQuery,
      { filter: { id: { eq: commentId } }, first: 1 },
      CommentByIdResponse,
    )
    return Option.fromNullishOr(data.comments.nodes[0])
  })

  const postComment = (issueId: string, body: string, id: string | undefined) =>
    client
      .execute(
        createCommentMutation,
        { input: id === undefined ? { issueId, body } : { issueId, body, id } },
        CreateCommentResponse,
      )
      .pipe(Effect.flatMap((data) => unwrapComment(data.commentCreate)))

  const resolveCreate = Effect.fn("IssueWriteApi.resolveCommentCreate")(
    function* resolveCommentCreate(ref: string, options: CommentCreateOptions) {
      const issueId = yield* resolvers.resolveIssueId(ref)
      const id =
        options.dedupeKey === undefined ? options.id : dedupeCommentId(issueId, options.dedupeKey)
      const existing = id === undefined ? Option.none<IssueComment>() : yield* findComment(id)
      return { existing, id, issueId }
    },
  )

  const planCommentCreate = Effect.fn("IssueWriteApi.planCommentCreate")(
    function* planCommentCreate(
      ref: string,
      body: string,
      options: CommentCreateOptions = {},
    ): Effect.fn.Return<CommentCreatePlan, IssueWriteApiError> {
      const resolved = yield* resolveCreate(ref, options)
      return {
        status: Option.isSome(resolved.existing) ? "skipped" : "created",
        action: "comment-create",
        target: ref,
        changes: createChanges(body, options, resolved.id),
      }
    },
  )

  const commentCreate = Effect.fn("IssueWriteApi.commentCreate")(function* commentCreate(
    ref: string,
    body: string,
    options: CommentCreateOptions = {},
  ): Effect.fn.Return<CommentCreateResult, IssueWriteApiError> {
    const resolved = yield* resolveCreate(ref, options)
    if (Option.isSome(resolved.existing)) {
      return { status: "skipped", comment: resolved.existing.value, visible: null }
    }
    const attempt = yield* Effect.result(postComment(resolved.issueId, body, resolved.id))
    if (Result.isFailure(attempt)) {
      if (resolved.id === undefined) {
        return yield* attempt.failure
      }
      const found = yield* findComment(resolved.id).pipe(
        Effect.orElseSucceed(() => Option.none<IssueComment>()),
      )
      if (Option.isSome(found)) {
        return { status: "skipped", comment: found.value, visible: null }
      }
      return yield* attempt.failure
    }
    const visible = yield* visibility.waitForComment(
      resolved.issueId,
      attempt.success.id,
      options.waitSeconds,
    )
    return { status: "created", comment: attempt.success, visible }
  })

  const existingComment = Effect.fn("IssueWriteApi.existingComment")(function* existingComment(
    commentId: string,
  ) {
    const current = yield* findComment(commentId)
    return yield* Effect.fromOption(current, () => missingComment(commentId))
  })

  const commentUpdate = Effect.fn("IssueWriteApi.commentUpdate")(function* commentUpdate(
    commentId: string,
    body: string,
    options: CommentUpdateOptions = {},
  ): Effect.fn.Return<CommentUpdateResult, IssueWriteApiError> {
    const current = yield* existingComment(commentId)
    if (options.dryRun === true) {
      return {
        dryRun: true,
        action: "comment-update",
        target: commentId,
        diff: unifiedDiff(current.body, body),
      }
    }
    const data = yield* client.execute(
      updateCommentMutation,
      { id: commentId, input: { body } },
      UpdateCommentResponse,
    )
    const comment = yield* unwrapComment(data.commentUpdate, "Linear did not update the comment.")
    return { dryRun: false, status: "updated", comment }
  })

  const planCommentDelete = Effect.fn("IssueWriteApi.planCommentDelete")(
    function* planCommentDelete(
      commentId: string,
    ): Effect.fn.Return<CommentDeletePlan, IssueWriteApiError> {
      yield* existingComment(commentId)
      return { action: "comment-delete", target: commentId }
    },
  )

  const commentDelete = Effect.fn("IssueWriteApi.commentDelete")(function* commentDelete(
    commentId: string,
  ): Effect.fn.Return<CommentDeleteResult, IssueWriteApiError> {
    yield* existingComment(commentId)
    const data = yield* client.execute(
      deleteCommentMutation,
      { id: commentId },
      DeleteCommentResponse,
    )
    yield* unwrapDelete(data.commentDelete, "Linear did not delete the comment.")
    return { status: "deleted", commentId }
  })

  return {
    commentCreate,
    commentDelete,
    commentUpdate,
    findComment,
    planCommentCreate,
    planCommentDelete,
  }
}

export { makeCommentWrites }
