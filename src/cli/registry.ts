import type { Command as CliCommand } from "effect/cli"

import { Command } from "effect/cli"

import { loginSpec, logoutSpec, statusSpec as authStatusSpec, whoamiSpec } from "@/cli/auth"
import { configSetSpec, configShowSpec, configUnsetSpec } from "@/cli/config"
import { withAgentNotes } from "@/cli/help"
import { issueCommand } from "@/cli/issue"
import { labelCreateSpec, labelEditSpec, labelListSpec } from "@/cli/label"
import { linkSpec } from "@/cli/link"
import {
  projectCreateSpec,
  projectDeleteSpec,
  projectListSpec,
  projectRestoreSpec,
} from "@/cli/project"
import { Format, OutputSelect, buildCommand, buildGroup } from "@/cli/runner"
import { statusSpec } from "@/cli/status"
import { teamCreateSpec, teamDeleteSpec, teamListSpec, teamShowSpec } from "@/cli/team"
import { unlinkSpec } from "@/cli/unlink"
import { workspaceListSpec, workspaceUseSpec } from "@/cli/workspace"

const globalOutputFlags = [Format, OutputSelect] as const

const authCommand = buildGroup("auth", "Manage Linear authentication", [
  buildCommand(loginSpec),
  buildCommand(authStatusSpec),
  buildCommand(logoutSpec),
]).pipe(Command.withGlobalFlags(globalOutputFlags))

const whoamiCommand = buildCommand(whoamiSpec).pipe(Command.withGlobalFlags(globalOutputFlags))

const statusCommand = buildCommand(statusSpec).pipe(Command.withGlobalFlags(globalOutputFlags))

const configCommand = buildGroup(
  "config",
  "Show and change the issue defaults of this repository",
  [buildCommand(configShowSpec), buildCommand(configSetSpec), buildCommand(configUnsetSpec)],
).pipe(Command.withGlobalFlags(globalOutputFlags))

const linkCommand = buildCommand(linkSpec).pipe(Command.withGlobalFlags(globalOutputFlags))

const unlinkCommand = buildCommand(unlinkSpec).pipe(Command.withGlobalFlags(globalOutputFlags))

const workspaceCommand = buildGroup("workspace", "Manage the stored Linear workspace profiles", [
  buildCommand(workspaceListSpec),
  buildCommand(workspaceUseSpec),
]).pipe(Command.withGlobalFlags(globalOutputFlags))

const teamCommand = buildGroup("team", "Inspect, create and delete the teams in the workspace", [
  buildCommand(teamListSpec),
  buildCommand(teamShowSpec),
  buildCommand(teamCreateSpec),
  buildCommand(teamDeleteSpec),
]).pipe(Command.withGlobalFlags(globalOutputFlags))

const projectCommand = buildGroup(
  "project",
  "Create, inspect, delete and restore the projects in the workspace",
  [
    buildCommand(projectListSpec),
    buildCommand(projectCreateSpec),
    buildCommand(projectDeleteSpec),
    buildCommand(projectRestoreSpec),
  ],
).pipe(Command.withGlobalFlags(globalOutputFlags))

const labelCommand = buildGroup("label", "Create and inspect the labels of a team", [
  buildCommand(labelListSpec),
  buildCommand(labelCreateSpec),
  buildCommand(labelEditSpec),
]).pipe(Command.withGlobalFlags(globalOutputFlags))

const commandGroups = [
  authCommand,
  whoamiCommand,
  statusCommand,
  configCommand,
  linkCommand,
  unlinkCommand,
  workspaceCommand,
  issueCommand,
  teamCommand,
  projectCommand,
  labelCommand,
] as const

const createRoot = <const Commands extends readonly CliCommand.Command.Any[]>(commands: Commands) =>
  Command.make("rata").pipe(
    Command.withDescription("Linear issue tracking for agent workflows."),
    Command.withSubcommands(commands),
    Command.withGlobalFlags(globalOutputFlags),
    withAgentNotes,
  )

export {
  authCommand,
  commandGroups,
  configCommand,
  createRoot,
  labelCommand,
  linkCommand,
  projectCommand,
  statusCommand,
  teamCommand,
  unlinkCommand,
  whoamiCommand,
  workspaceCommand,
}
