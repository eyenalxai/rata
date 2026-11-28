import { Effect, Option, Result } from "effect"

import type { CommentId, IssueId } from "@/domain/id"
import type { LinearClientShape } from "@/linear/client"
import type { IssueComment } from "@/linear/decode/issue"
import type { IssueWriteApiError } from "@/tracker/write/model"
import type { makeIssueWriteResolvers } from "@/tracker/write/resolvers"
import type { makeVisibilityChecks } from "@/tracker/write/visibility"
import type { CommentCreateOptions, CommentCreateResult } from "@/tracker/write/write-types"

import { dedupeCommentId } from "@/domain/comment"
import { CommentByIdResponse, CreateCommentResponse } from "@/linear/decode/issue"
import { commentByIdQuery, createCommentMutation } from "@/tracker/write/documents"
import { unwrapComment } from "@/tracker/write/model"

type CommentDependencies = {
  readonly client: LinearClientShape
  readonly resolvers: ReturnType<typeof makeIssueWriteResolvers>
  readonly visibility: ReturnType<typeof makeVisibilityChecks>
}

const makeCommentWrites = ({ client, resolvers, visibility }: CommentDependencies) => {
  const findComment = Effect.fn("IssueWriter.findComment")(function* findComment(
    commentId: CommentId,
  ): Effect.fn.Return<Option.Option<IssueComment>, IssueWriteApiError> {
    const data = yield* client.execute(
      commentByIdQuery,
      { filter: { id: { eq: commentId } }, first: 1 },
      CommentByIdResponse,
    )
    return Option.fromNullishOr(data.comments.nodes[0])
  })

  const postComment = (issueId: IssueId, body: string, id: CommentId | undefined) =>
    client
      .execute(
        createCommentMutation,
        { input: id === undefined ? { issueId, body } : { issueId, body, id } },
        CreateCommentResponse,
      )
      .pipe(Effect.flatMap((data) => unwrapComment(data.commentCreate)))

  const resolveCreate = Effect.fn("IssueWriter.resolveCommentCreate")(
    function* resolveCommentCreate(ref: string, options: CommentCreateOptions) {
      const issueId = yield* resolvers.resolveIssueId(ref)
      const id =
        options.dedupeKey === undefined ? options.id : dedupeCommentId(issueId, options.dedupeKey)
      const existing = id === undefined ? Option.none<IssueComment>() : yield* findComment(id)
      return { existing, id, issueId }
    },
  )

  const commentCreate = Effect.fn("IssueWriter.commentCreate")(function* commentCreate(
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

  return { commentCreate, findComment }
}

export { makeCommentWrites }
