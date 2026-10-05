#!/usr/bin/env bun
import { BunRuntime, BunServices } from "@effect/platform-bun"
import { Effect, Layer } from "effect"
import { Command } from "effect/cli"
import { FetchHttpClient } from "effect/http"

import { LinearClient } from "@/api/client"
import { root } from "@/cli/root"
import { Auth } from "@/config/auth"

const platformLayer = BunServices.layer
const authLayer = Auth.layer.pipe(Layer.provide(platformLayer))
const clientLayer = LinearClient.layer.pipe(
  Layer.provide(authLayer),
  Layer.provide(FetchHttpClient.layer),
)
const appLayer = Layer.mergeAll(authLayer, clientLayer, platformLayer)

// oxlint-disable-next-line effecttsgo/strict-effect-provide -- This is the application entry point; it owns the layer graph.
const program = Command.run(root, { version: "0.1.0" }).pipe(Effect.provide(appLayer))

BunRuntime.runMain(program)
