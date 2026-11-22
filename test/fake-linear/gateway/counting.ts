import type { MemorySeed } from "@test/fake-linear/gateway/model"

import { makeMemoryGateway } from "@test/fake-linear/gateway/memory"
import { Effect, Layer } from "effect"

import type { LinearGatewayShape } from "@/linear/gateway"

import { LinearGateway } from "@/linear/gateway"

type GatewayCounts = {
  readonly byId: () => number
  readonly byKey: () => number
  readonly details: () => number
  readonly viewer: () => number
  readonly reset: () => void
}

const countingGateway = (
  seed: MemorySeed,
): { readonly gateway: LinearGatewayShape; readonly counts: GatewayCounts } => {
  const base = makeMemoryGateway(seed)
  let byId = 0
  let byKey = 0
  let details = 0
  let viewer = 0

  const gateway: LinearGatewayShape = {
    ...base,
    viewer: Effect.suspend(() => {
      viewer += 1
      return base.viewer
    }),
    team: {
      ...base.team,
      byId: (id) =>
        Effect.suspend(() => {
          byId += 1
          return base.team.byId(id)
        }),
      byKey: (ref) =>
        Effect.suspend(() => {
          byKey += 1
          return base.team.byKey(ref)
        }),
      details: (team) =>
        Effect.suspend(() => {
          details += 1
          return base.team.details(team)
        }),
    },
  }

  return {
    gateway,
    counts: {
      byId: () => byId,
      byKey: () => byKey,
      details: () => details,
      viewer: () => viewer,
      reset: () => {
        byId = 0
        byKey = 0
        details = 0
        viewer = 0
      },
    },
  }
}

const countingGatewayLayer = (seed: MemorySeed): Layer.Layer<LinearGateway> =>
  Layer.succeed(LinearGateway, countingGateway(seed).gateway)

export { countingGateway, countingGatewayLayer, type GatewayCounts }
