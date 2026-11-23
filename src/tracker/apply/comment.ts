import { Effect, Option } from "effect"

import type { ApplyDocument } from "@/domain/apply"
import type { ApplyPlanError, ApplyWriter } from "@/tracker/apply/model"
import type { IssueWorkingSetFull } from "@/tracker/model"
import type { ApplyStep, PlannedAction } from "@/tracker/plan"

import { dedupeCommentId } from "@/domain/comment"
import { TrackerError } from "@/domain/error"

type CommentDependencies = {
  readonly writer: ApplyWriter
}

const validationError = (message: string, hint: string | null = null) =>
  new TrackerError({ code: "validation", message, hint })

const commentAction = (
  ref: string,
  status: "updated" | "skipped",
  commentId: ReturnType<typeof dedupeCommentId>,
): PlannedAction => ({
  action: "comment-create",
  target: ref,
  status,
  changes: { commentId },
})

const planCommentStep = (
  dependencies: CommentDependencies,
  ref: string,
  snapshot: IssueWorkingSetFull,
  document: ApplyDocument,
): Effect.Effect<ApplyStep | null, ApplyPlanError> => {
  const comment = document.comment
  if (comment === undefined) {
    return Effect.succeed(null)
  }
  return Effect.gen(function* planCommentWrite() {
    if (comment.body.trim().length === 0) {
      return yield* validationError("The comment body is empty.")
    }
    if (comment.dedupeKey === undefined || comment.dedupeKey.trim().length === 0) {
      return yield* validationError(
        "The comment needs a dedupeKey.",
        "Set comment.dedupeKey to a stable string so a retry is safe.",
      )
    }
    const commentId = dedupeCommentId(snapshot.id, comment.dedupeKey)
    const existing = yield* dependencies.writer.findComment(commentId)
    const status = Option.isSome(existing) ? "skipped" : "updated"
    return {
      action: "comment-create",
      target: ref,
      status,
      changes: { dedupeKey: comment.dedupeKey, commentId },
      changed: status === "updated" ? ["comment"] : [],
      actions: [commentAction(ref, status, commentId)],
      issueId: snapshot.id,
      body: comment.body,
      commentId,
    }
  })
}

export { planCommentStep }
