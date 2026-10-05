#!/usr/bin/env bun
import { BunRuntime, BunServices } from "@effect/platform-bun"
import { Effect } from "effect"
import { Command } from "effect/cli"

const command = Command.make("rata").pipe(
  Command.withDescription("Linear issue tracking for agent workflows."),
)

const program = command.pipe(Command.run({ version: "0.1.0" }))

// oxlint-disable-next-line effecttsgo/strict-effect-provide
BunRuntime.runMain(program.pipe(Effect.provide(BunServices.layer)))
