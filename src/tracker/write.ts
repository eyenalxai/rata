import { Context, Effect, Layer } from "effect"

import type { IssueWriterShape } from "@/tracker/write/api-shape"

import { ContextResolver } from "@/context/resolve"
import { LinearGateway } from "@/linear/gateway"
import { makeBodyWrites } from "@/tracker/write/body"
import { makeBulkWrites } from "@/tracker/write/bulk"
import { makeCommentWrites } from "@/tracker/write/comments"
import { makeCreateWrites } from "@/tracker/write/create"
import { makeIssueWrites } from "@/tracker/write/issue-writes"
import { makeRelationWrites } from "@/tracker/write/relation-writes"
import { makeIssueWriteResolvers } from "@/tracker/write/resolvers"
import { makeSectionWrites } from "@/tracker/write/sections"
import { makeVisibilityChecks } from "@/tracker/write/visibility"

class IssueWriter extends Context.Service<IssueWriter, IssueWriterShape>()(
  "rata-cli/tracker/write/IssueWriter",
) {
  static readonly layer = Layer.effect(
    IssueWriter,
    Effect.gen(function* issueWriterLayer() {
      const gateway = yield* LinearGateway
      // Writes use the raw transport on purpose: the read gateway exposes its client, and the write documents stay in tracker/write/documents.ts until a write gateway lands.
      const client = gateway.client
      const contexts = yield* ContextResolver
      const resolvers = makeIssueWriteResolvers({ client, contexts, gateway })
      const visibility = makeVisibilityChecks({ client })
      const comments = makeCommentWrites({ client, resolvers, visibility })
      const relations = makeRelationWrites({ client, resolvers })

      return IssueWriter.of({
        ...makeIssueWrites(resolvers),
        ...makeBulkWrites(resolvers),
        ...makeBodyWrites({ client, resolvers }),
        ...makeSectionWrites({ client, resolvers }),
        ...makeCreateWrites({ client, resolvers, visibility }),
        commentCreate: (_context, ref, body, options) => comments.commentCreate(ref, body, options),
        planCommentCreate: (_context, ref, body, options) =>
          comments.planCommentCreate(ref, body, options),
        commentUpdate: (_context, commentId, body, options) =>
          comments.commentUpdate(commentId, body, options),
        commentDelete: (_context, commentId) => comments.commentDelete(commentId),
        planCommentDelete: (_context, commentId) => comments.planCommentDelete(commentId),
        findComment: (_context, commentId) => comments.findComment(commentId),
        link: (_context, ref, changes, options) => relations.link(ref, changes, options),
        unlink: (_context, ref, changes, options) => relations.unlink(ref, changes, options),
      })
    }),
  )
}

export { IssueWriter }
