import { Duration, Effect, Option, Schema } from "effect"

import type { LinearClient } from "@/api/client"
import type { WriteVisibility } from "@/api/issue-write/write-types"
import type { CommentId, IssueId } from "@/domain/id"
import type { LinearApiError } from "@/linear/errors"

import { childTailQuery, commentTailQuery } from "@/api/issue-write/documents"
import { CommentId as CommentIdSchema, IssueId as IssueIdSchema } from "@/domain/id"
import { pageSize } from "@/linear/connection"

const defaultWaitSeconds = 5
const pollInterval = Duration.millis(250)

const ChildTailResponse = Schema.Struct({
  issue: Schema.Struct({
    children: Schema.Struct({ nodes: Schema.Array(Schema.Struct({ id: IssueIdSchema })) }),
  }),
})

const CommentTailResponse = Schema.Struct({
  issue: Schema.Struct({
    comments: Schema.Struct({ nodes: Schema.Array(Schema.Struct({ id: CommentIdSchema })) }),
  }),
})

type VisibilityRead<A extends { readonly id: string }> = () => Effect.Effect<
  readonly A[],
  LinearApiError
>

type VisibilityDependencies = {
  readonly client: LinearClient["Service"]
}

const verifyVisible = <A extends { readonly id: string }>(
  id: string,
  waitSeconds: number | undefined,
  read: VisibilityRead<A>,
): Effect.Effect<WriteVisibility> => {
  const seconds = waitSeconds ?? defaultWaitSeconds
  if (seconds <= 0) {
    return Effect.succeed(null)
  }
  const poll = Effect.gen(function* pollForVisibility() {
    while (true) {
      const nodes = yield* read().pipe(
        // ADR-0006: the check is advisory, so a failed read cannot fail the write.
        Effect.orElseSucceed((): readonly A[] => []),
      )
      if (nodes.some((node) => node.id === id)) {
        return true
      }
      yield* Effect.sleep(pollInterval)
    }
  })
  return poll.pipe(
    Effect.timeoutOption(Duration.seconds(seconds)),
    Effect.map(Option.getOrElse(() => false)),
  )
}

const makeVisibilityChecks = ({ client }: VisibilityDependencies) => {
  const waitForChild = Effect.fn("IssueWriteApi.waitForChild")(function* waitForChild(
    parentId: IssueId,
    childId: IssueId,
    waitSeconds: number | undefined,
  ) {
    return yield* verifyVisible(childId, waitSeconds, () =>
      client
        .execute(childTailQuery, { id: parentId, last: pageSize }, ChildTailResponse)
        .pipe(Effect.map((data) => data.issue.children.nodes)),
    )
  })

  const waitForComment = Effect.fn("IssueWriteApi.waitForComment")(function* waitForComment(
    issueId: IssueId,
    commentId: CommentId,
    waitSeconds: number | undefined,
  ) {
    return yield* verifyVisible(commentId, waitSeconds, () =>
      client
        .execute(commentTailQuery, { id: issueId, last: pageSize }, CommentTailResponse)
        .pipe(Effect.map((data) => data.issue.comments.nodes)),
    )
  })

  return { waitForChild, waitForComment }
}

export { makeVisibilityChecks, type VisibilityDependencies }
