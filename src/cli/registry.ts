import type { Command as CliCommand } from "effect/cli"

import { Command } from "effect/cli"

import { authCommand, whoamiCommand } from "@/cli/auth"
import { configCommand } from "@/cli/config"
import { OutputFields } from "@/cli/fields"
import { withAgentNotes } from "@/cli/help"
import { issueCommand, searchCommand } from "@/cli/issue"
import { labelCommand } from "@/cli/label"
import { linkCommand } from "@/cli/link"
import { nextCommand } from "@/cli/next"
import { JsonOutput } from "@/cli/output"
import { projectCommand } from "@/cli/project"
import { statusCommand } from "@/cli/status"
import { teamCommand } from "@/cli/team"
import { unlinkCommand } from "@/cli/unlink"
import { whyCommand } from "@/cli/why"
import { workspaceCommand } from "@/cli/workspace"

const commandGroups = [
  authCommand,
  whoamiCommand,
  statusCommand,
  configCommand,
  linkCommand,
  unlinkCommand,
  workspaceCommand,
  issueCommand,
  searchCommand,
  nextCommand,
  whyCommand,
  teamCommand,
  projectCommand,
  labelCommand,
] as const

const createRoot = <const Commands extends readonly CliCommand.Command.Any[]>(commands: Commands) =>
  Command.make("rata").pipe(
    Command.withDescription("Linear issue tracking for agent workflows."),
    Command.withSubcommands(commands),
    Command.withGlobalFlags([JsonOutput, OutputFields]),
    withAgentNotes,
  )

const root = createRoot(commandGroups)

export { commandGroups, createRoot, root }
