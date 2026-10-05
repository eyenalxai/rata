import { Command } from "effect/cli"

import { authCommand, whoamiCommand } from "@/cli/auth"

const root = Command.make("rata").pipe(
  Command.withDescription("Linear issue tracking for agent workflows."),
  Command.withSubcommands([authCommand, whoamiCommand]),
)

export { root }
