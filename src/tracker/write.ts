import { Context, Effect, Layer } from "effect"

import type { IssueWriterShape } from "@/tracker/write/api-shape"

import { ContextResolver } from "@/context/resolve"
import { LinearGateway } from "@/linear/gateway"
import { toTrackerError } from "@/tracker/error-report"
import { makeApplyWrites } from "@/tracker/write/apply"
import { makeCommentWrites } from "@/tracker/write/comments"
import { makeCreateWrites } from "@/tracker/write/create"
import { makeIssueWrites } from "@/tracker/write/issue-writes"
import { makeIssueWriteResolvers } from "@/tracker/write/resolvers"
import { makeVisibilityChecks } from "@/tracker/write/visibility"

class IssueWriter extends Context.Service<IssueWriter, IssueWriterShape>()(
  "rata-cli/tracker/write/IssueWriter",
) {
  static readonly layer = Layer.effect(
    IssueWriter,
    Effect.gen(function* issueWriterLayer() {
      const gateway = yield* LinearGateway
      const client = gateway.client
      const contexts = yield* ContextResolver
      const resolvers = makeIssueWriteResolvers({ client, contexts, gateway })
      const visibility = makeVisibilityChecks({ client })
      const comments = makeCommentWrites({ client })
      const applyWrites = makeApplyWrites({ client, resolvers, comments })
      const issueWrites = makeIssueWrites(resolvers)
      const createWrites = makeCreateWrites({ client, resolvers, visibility })

      return IssueWriter.of({
        create: createWrites.create,
        planCreate: createWrites.planCreate,
        close: issueWrites.close,
        applyStep: applyWrites.applyStep,
        resolveState: (context, issueId, name) =>
          resolvers.resolveIssueState(context, issueId, name).pipe(Effect.mapError(toTrackerError)),
        resolveLabels: (context, issueId, names) =>
          resolvers
            .resolveIssueLabels(context, issueId, names)
            .pipe(Effect.mapError(toTrackerError)),
        resolveAssignee: (context, value) =>
          resolvers.resolveAssignee(context, value).pipe(Effect.mapError(toTrackerError)),
        resolveProject: (value) =>
          resolvers.resolveProjectId(value).pipe(Effect.mapError(toTrackerError)),
        resolveParent: (value) =>
          resolvers.resolveIssueId(value).pipe(Effect.mapError(toTrackerError)),
        resolveRelations: (ref, changes) =>
          resolvers.resolveRelations(ref, changes).pipe(
            Effect.map((resolved) => resolved.targets),
            Effect.mapError(toTrackerError),
          ),
        collectRelations: (issueId) =>
          resolvers.collectRelations(issueId).pipe(Effect.mapError(toTrackerError)),
        findComment: (commentId) =>
          comments.findComment(commentId).pipe(Effect.mapError(toTrackerError)),
      })
    }),
  )
}

export { IssueWriter }
