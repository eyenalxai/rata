import { Context, Effect, Layer } from "effect"

import type { IssueWriterShape } from "@/tracker/write/api-shape"

import { ContextResolver } from "@/context/resolve"
import { LinearGateway } from "@/linear/gateway"
import { makeCreateWrites } from "@/tracker/write/create"
import { makeIssueWriteResolvers } from "@/tracker/write/resolvers"
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

      return IssueWriter.of(makeCreateWrites({ client, resolvers, visibility }))
    }),
  )
}

export { IssueWriter }
