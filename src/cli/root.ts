import { Command } from "effect/cli"

import { authCommand, whoamiCommand } from "@/cli/auth"
import { initCommand } from "@/cli/init"
import { issueCommand, searchCommand } from "@/cli/issue"
import { labelCommand } from "@/cli/label"
import { linkCommand } from "@/cli/link"
import { projectCommand } from "@/cli/project"
import { teamCommand } from "@/cli/team"
import { workspaceCommand } from "@/cli/workspace"

const root = Command.make("rata").pipe(
  Command.withDescription("Linear issue tracking for agent workflows."),
  Command.withSubcommands([
    authCommand,
    whoamiCommand,
    initCommand,
    linkCommand,
    workspaceCommand,
    issueCommand,
    searchCommand,
    teamCommand,
    projectCommand,
    labelCommand,
  ]),
)

export { root }
