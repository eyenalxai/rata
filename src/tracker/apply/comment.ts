import { Effect, Option } from "effect"

import type { ApplyDocument } from "@/domain/apply"
import type { CommentId } from "@/domain/id"
import type { ApplyPlanError } from "@/tracker/apply/model"
import type { IssueWorkingSetFull } from "@/tracker/model"
import type { PlannedAction, PlanStep } from "@/tracker/plan"
import type { makeCommentWrites } from "@/tracker/write/comments"

import { dedupeCommentId } from "@/domain/comment"
import { TrackerError } from "@/domain/error"
import { toTrackerError } from "@/domain/error/report"

type CommentDependencies = {
  readonly comments: ReturnType<typeof makeCommentWrites>
}

const validationError = (message: string, hint: string | null = null) =>
  new TrackerError({ code: "validation", message, hint })

const commentAction = (
  ref: string,
  status: "updated" | "skipped",
  commentId: CommentId | undefined,
): PlannedAction => ({
  action: "comment-create",
  target: ref,
  status,
  changes: commentId === undefined ? {} : { commentId },
})

const planCommentStep = (
  dependencies: CommentDependencies,
  ref: string,
  snapshot: IssueWorkingSetFull,
  document: ApplyDocument,
): Effect.Effect<PlanStep | null, ApplyPlanError> => {
  const comment = document.comment
  if (comment === undefined) {
    return Effect.succeed(null)
  }
  return Effect.gen(function* planCommentWrite() {
    if (comment.body.trim().length === 0) {
      return yield* validationError("The comment body is empty.")
    }
    const commentId =
      comment.dedupeKey === undefined ? undefined : dedupeCommentId(snapshot.id, comment.dedupeKey)
    const existing =
      commentId === undefined ? Option.none() : yield* dependencies.comments.findComment(commentId)
    const status = Option.isSome(existing) ? "skipped" : "updated"
    return {
      action: "comment-create",
      target: ref,
      status,
      changes: {
        ...(comment.dedupeKey === undefined ? {} : { dedupeKey: comment.dedupeKey }),
        ...(commentId === undefined ? {} : { commentId }),
      },
      changed: status === "updated" ? ["comment"] : [],
      actions: [commentAction(ref, status, commentId)],
      execute:
        status === "skipped"
          ? Effect.void
          : dependencies.comments
              .commentCreate(ref, comment.body, {
                ...(comment.dedupeKey === undefined ? {} : { dedupeKey: comment.dedupeKey }),
                waitSeconds: 0,
              })
              .pipe(Effect.asVoid, Effect.mapError(toTrackerError)),
    }
  })
}

export { planCommentStep }
