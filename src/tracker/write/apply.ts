import { Effect } from "effect"

import type { RelationId } from "@/domain/id"
import type { LinearClientShape } from "@/linear/client"
import type { ApplyStep } from "@/tracker/plan"
import type { makeCommentWrites } from "@/tracker/write/comments"
import type { IssueWriteApiError } from "@/tracker/write/model"
import type { makeIssueWriteResolvers } from "@/tracker/write/resolvers"

import { TrackerError } from "@/domain/error"
import {
  CreateRelationResponse,
  DeleteRelationResponse,
  UpdateIssueResponse,
} from "@/linear/decode/issue"
import { toTrackerError } from "@/tracker/error-report"
import {
  createRelationMutation,
  deleteRelationMutation,
  updateIssueMutation,
} from "@/tracker/write/documents"
import { unwrapIssue, unwrapRelation } from "@/tracker/write/model"

type ApplyWriteDependencies = {
  readonly client: LinearClientShape
  readonly resolvers: ReturnType<typeof makeIssueWriteResolvers>
  readonly comments: ReturnType<typeof makeCommentWrites>
}

type StepError = IssueWriteApiError | TrackerError

const requireRelationId = (
  relationId: RelationId | undefined,
): Effect.Effect<RelationId, TrackerError> =>
  relationId === undefined
    ? Effect.fail(
        new TrackerError({
          code: "internal",
          message: "The relation-remove step has no relation id.",
          hint: null,
        }),
      )
    : Effect.succeed(relationId)

const makeApplyWrites = ({ client, resolvers, comments }: ApplyWriteDependencies) => {
  const runStep = (step: ApplyStep): Effect.Effect<void, StepError> => {
    switch (step.action) {
      case "update-fields": {
        return client
          .execute(
            updateIssueMutation,
            { id: step.issueId, input: step.input },
            UpdateIssueResponse,
          )
          .pipe(
            Effect.flatMap((data) => unwrapIssue(data.issueUpdate)),
            Effect.asVoid,
          )
      }
      case "add-label": {
        return resolvers.addLabel(step.issueId, step.labelId).pipe(Effect.asVoid)
      }
      case "remove-label": {
        return resolvers.removeLabel(step.issueId, step.labelId).pipe(Effect.asVoid)
      }
      case "update-sections": {
        return client
          .execute(
            updateIssueMutation,
            { id: step.issueId, input: { description: step.description } },
            UpdateIssueResponse,
          )
          .pipe(
            Effect.flatMap((data) => unwrapIssue(data.issueUpdate)),
            Effect.asVoid,
          )
      }
      case "comment-create": {
        return comments.createForIssue(step.issueId, step.body, step.commentId).pipe(Effect.asVoid)
      }
      case "relation-add": {
        return client
          .execute(createRelationMutation, { input: step.input }, CreateRelationResponse)
          .pipe(Effect.flatMap((data) => unwrapRelation(data.issueRelationCreate)))
      }
      case "relation-remove": {
        return requireRelationId(step.relationId).pipe(
          Effect.flatMap((relationId) =>
            client
              .execute(deleteRelationMutation, { id: relationId }, DeleteRelationResponse)
              .pipe(Effect.flatMap((data) => unwrapRelation(data.issueRelationDelete))),
          ),
        )
      }
      default: {
        return Effect.fail(
          new TrackerError({
            code: "internal",
            message: "The apply plan contains an unknown step.",
            hint: null,
          }),
        )
      }
    }
  }

  const applyStep = Effect.fn("IssueWriter.applyStep")(function* applyStep(
    step: ApplyStep,
  ): Effect.fn.Return<void, TrackerError> {
    return yield* runStep(step).pipe(Effect.mapError(toTrackerError))
  })

  return { applyStep }
}

export { makeApplyWrites }
