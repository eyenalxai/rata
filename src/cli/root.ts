import { Command } from "effect/cli"

import { authCommand, whoamiCommand } from "@/cli/auth"
import { configCommand } from "@/cli/config"
import { OutputFields } from "@/cli/fields"
import { issueCommand, searchCommand } from "@/cli/issue"
import { labelCommand } from "@/cli/label"
import { linkCommand } from "@/cli/link"
import { JsonOutput } from "@/cli/output"
import { projectCommand } from "@/cli/project"
import { statusCommand } from "@/cli/status"
import { teamCommand } from "@/cli/team"
import { unlinkCommand } from "@/cli/unlink"
import { workspaceCommand } from "@/cli/workspace"

const root = Command.make("rata").pipe(
  Command.withDescription("Linear issue tracking for agent workflows."),
  Command.withSubcommands([
    authCommand,
    whoamiCommand,
    statusCommand,
    configCommand,
    linkCommand,
    unlinkCommand,
    workspaceCommand,
    issueCommand,
    searchCommand,
    teamCommand,
    projectCommand,
    labelCommand,
  ]),
  Command.withGlobalFlags([JsonOutput, OutputFields]),
)

export { root }
