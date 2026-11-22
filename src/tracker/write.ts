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
      const client = gateway.client
      const contexts = yield* ContextResolver
      const resolvers = makeIssueWriteResolvers({ client, contexts, gateway })
      const visibility = makeVisibilityChecks({ client })

      return IssueWriter.of({
        ...makeIssueWrites(resolvers),
        ...makeBulkWrites(resolvers),
        ...makeBodyWrites({ client, resolvers }),
        ...makeSectionWrites({ client, resolvers }),
        ...makeCreateWrites({ client, resolvers, visibility }),
        ...makeCommentWrites({ client, resolvers, visibility }),
        ...makeRelationWrites({ client, resolvers }),
      })
    }),
  )
}

export { IssueWriter }
