import { Context, Effect, Layer } from "effect"

import type { IssuePublishShape, PublishDependencies } from "@/tracker/publish/model"

import { ContextResolver } from "@/context/resolve"
import { LinearGateway } from "@/linear/gateway"
import { executePublish } from "@/tracker/publish/execute"
import { dryRunPublish } from "@/tracker/publish/execute/results"
import { makePublishPlan } from "@/tracker/publish/plan"
import { makeIssueWriteResolvers } from "@/tracker/write/resolvers"

class IssuePublish extends Context.Service<IssuePublish, IssuePublishShape>()(
  "rata-cli/tracker/publish/IssuePublish",
) {
  static readonly layer = Layer.effect(
    IssuePublish,
    Effect.gen(function* issuePublishLayer() {
      const gateway = yield* LinearGateway
      const contexts = yield* ContextResolver
      const client = gateway.client
      const dependencies: PublishDependencies = {
        client,
        gateway,
        contexts,
        resolvers: makeIssueWriteResolvers({ client, contexts, gateway }),
      }
      return IssuePublish.of({
        plan: (context, document) => makePublishPlan(dependencies, context, document),
        dryRun: dryRunPublish,
        execute: (plan) => executePublish(client, plan),
      })
    }),
  )
}

export { IssuePublish }
