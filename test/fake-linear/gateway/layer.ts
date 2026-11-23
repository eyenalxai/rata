import type { MemorySeed } from "@test/fake-linear/gateway/model"

import { makeMemoryGateway } from "@test/fake-linear/gateway/memory"
import { Layer } from "effect"

import { LinearGateway } from "@/linear/gateway"

const memoryGatewayLayer = (seed: MemorySeed): Layer.Layer<LinearGateway> =>
  Layer.succeed(LinearGateway, makeMemoryGateway(seed))

export { memoryGatewayLayer }
