import type { Command as CliCommand } from "effect/cli"

import { Effect } from "effect"
import { Command } from "effect/cli"

import type { Surface } from "@/cli/surface"

import { apiSpec } from "@/cli/admin/api"
import { makeDoctorSpec } from "@/cli/admin/doctor"
import { loginSpec, logoutSpec, statusSpec as authStatusSpec } from "@/cli/auth"
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
import { surfaceOf } from "@/cli/surface"
import { teamCreateSpec, teamDeleteSpec, teamListSpec, teamShowSpec } from "@/cli/team"
import { unlinkSpec } from "@/cli/unlink"
import { workspaceListSpec, workspaceUseSpec } from "@/cli/workspace"
import { TrackerError } from "@/domain/error"

const globalOutputFlags = [Format, OutputSelect] as const

// Status and doctor need the finished tree, which includes the admin group; publish it once after the tree is built.
const surfaceState: { current: Surface | null } = { current: null }

const surface = (): Surface => {
  if (surfaceState.current === null) {
    throw new Error("The command surface is not ready.")
  }
  return surfaceState.current
}

const authCommand = buildGroup("auth", "Manage Linear authentication", [
  buildCommand(loginSpec),
  buildCommand(authStatusSpec),
  buildCommand(logoutSpec),
]).pipe(Command.withGlobalFlags(globalOutputFlags))

const statusCommand = buildCommand(statusSpec(surface)).pipe(
  Command.withGlobalFlags(globalOutputFlags),
)

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

const doctorCommand = buildCommand(makeDoctorSpec(surface)).pipe(
  Command.withGlobalFlags(globalOutputFlags),
)

const apiCommand = buildCommand(apiSpec).pipe(Command.withGlobalFlags(globalOutputFlags))

const adminCommand = buildGroup(
  "admin",
  "Manage auth, the repository link, teams, projects, labels, the tracker doctor and the read-only API",
  [
    authCommand,
    linkCommand,
    unlinkCommand,
    workspaceCommand,
    configCommand,
    teamCommand,
    projectCommand,
    labelCommand,
    doctorCommand,
    apiCommand,
  ],
).pipe(Command.withGlobalFlags(globalOutputFlags))

const phase2Group = (name: string, description: string) =>
  Command.make(name).pipe(
    Command.withDescription(description),
    Command.withHandler(() =>
      Effect.fail(
        new TrackerError({
          code: "usage",
          message: `The ${name} command is not available yet.`,
          hint: "The triage and map roots are reserved for phase 2.",
        }),
      ),
    ),
  )

const triageCommand = phase2Group("triage", "Triage the queue and change roles. Not available yet.")

const mapCommand = phase2Group("map", "Claim and resolve wayfinding work. Not available yet.")

const commandGroups = [
  statusCommand,
  issueCommand,
  triageCommand,
  mapCommand,
  adminCommand,
] as const

surfaceState.current = surfaceOf(commandGroups, [Format.flag, OutputSelect.flag])

const createRoot = <const Commands extends readonly CliCommand.Command.Any[]>(commands: Commands) =>
  Command.make("rata").pipe(
    Command.withDescription("Linear issue tracking for agent workflows."),
    Command.withSubcommands(commands),
    Command.withGlobalFlags(globalOutputFlags),
    withAgentNotes,
  )

export {
  adminCommand,
  commandGroups,
  createRoot,
  issueCommand,
  labelCommand,
  mapCommand,
  projectCommand,
  statusCommand,
  surface,
  teamCommand,
  triageCommand,
}
