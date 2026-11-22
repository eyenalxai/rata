import { Context, Effect, Layer } from "effect"

import type { LinearClientShape } from "@/linear/client"

import { LinearGateway } from "@/linear/gateway"

class LinearClient extends Context.Service<LinearClient, LinearClientShape>()(
  "rata-cli/api/client/LinearClient",
) {
  static readonly layer = Layer.effect(
    LinearClient,
    Effect.gen(function* linearClientLayer() {
      const gateway = yield* LinearGateway
      return LinearClient.of(gateway.client)
    }),
  )
}

export { LinearClient }
