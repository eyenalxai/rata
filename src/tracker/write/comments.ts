import { Effect, Option, Result } from "effect"

import type { CommentId, IssueId } from "@/domain/id"
import type { LinearClientShape } from "@/linear/client"
import type { IssueComment } from "@/linear/decode/issue"
import type { IssueWriteApiError } from "@/tracker/write/model"

import { CommentByIdResponse, CreateCommentResponse } from "@/linear/decode/issue"
import { commentByIdQuery, createCommentMutation } from "@/tracker/write/documents"
import { unwrapComment } from "@/tracker/write/model"

type CommentDependencies = {
  readonly client: LinearClientShape
}

const makeCommentWrites = ({ client }: CommentDependencies) => {
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

  const postComment = (issueId: IssueId, body: string, id: CommentId) =>
    client
      .execute(createCommentMutation, { input: { issueId, body, id } }, CreateCommentResponse)
      .pipe(Effect.flatMap((data) => unwrapComment(data.commentCreate)))

  const createForIssue = Effect.fn("IssueWriter.createCommentForIssue")(function* createForIssue(
    issueId: IssueId,
    body: string,
    commentId: CommentId,
  ): Effect.fn.Return<IssueComment, IssueWriteApiError> {
    const attempt = yield* Effect.result(postComment(issueId, body, commentId))
    if (Result.isSuccess(attempt)) {
      return attempt.success
    }
    const found = yield* findComment(commentId).pipe(
      Effect.orElseSucceed(() => Option.none<IssueComment>()),
    )
    if (Option.isSome(found)) {
      return found.value
    }
    return yield* attempt.failure
  })

  return { createForIssue, findComment }
}

export { makeCommentWrites }
