import { Command } from "effect/cli"

import { authCommand, whoamiCommand } from "@/cli/auth"
import { issueCommand, searchCommand } from "@/cli/issue"
import { labelCommand } from "@/cli/label"
import { projectCommand } from "@/cli/project"
import { teamCommand } from "@/cli/team"

const root = Command.make("rata").pipe(
  Command.withDescription("Linear issue tracking for agent workflows."),
  Command.withSubcommands([
    authCommand,
    whoamiCommand,
    issueCommand,
    searchCommand,
    teamCommand,
    projectCommand,
    labelCommand,
  ]),
)

export { root }
