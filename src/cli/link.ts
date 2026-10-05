import { Effect, Option } from "effect"
import { Command, Flag } from "effect/cli"

import { formatFile, formatNames, reportFailure, writeJson, writeLine } from "@/cli/output"
import { InitService } from "@/config/init"
import { machineTimezone } from "@/domain/timezone"

const jsonFlag = Flag.Boolean("json").pipe(
  Flag.withDescription("Print machine-readable JSON"),
  Flag.withDefault(false),
)

const teamFlag = Flag.String("team").pipe(
  Flag.withDescription("Team key or id. Without --workspace, link searches every stored workspace"),
  Flag.optional,
)

const projectFlag = Flag.String("project").pipe(
  Flag.withDescription("Default project name or id for this repository"),
  Flag.optional,
)

const workspaceFlag = Flag.String("workspace").pipe(
  Flag.withDescription("Workspace profile to link in. Skips the workspace prompt"),
  Flag.optional,
)

const createFlag = Flag.Boolean("create").pipe(
  Flag.withDescription("Create the team when it does not exist"),
  Flag.withDefault(false),
)

const nameFlag = Flag.String("name").pipe(
  Flag.withDescription("Team name, used with --create"),
  Flag.optional,
)

const forceFlag = Flag.Boolean("force").pipe(
  Flag.withDescription("Overwrite the existing agent documents and AGENTS.md"),
  Flag.withDefault(false),
)

const linkCommand = Command.make(
  "link",
  {
    team: teamFlag,
    project: projectFlag,
    workspace: workspaceFlag,
    create: createFlag,
    name: nameFlag,
    force: forceFlag,
    json: jsonFlag,
  },
  (config) =>
    Effect.gen(function* link() {
      const service = yield* InitService
      const result = yield* service.link({
        team: config.team,
        project: config.project,
        workspace: config.workspace,
        create: config.create,
        name: config.name,
        force: config.force,
        timezone: machineTimezone(),
      })
      if (config.json) {
        return yield* writeJson({
          team: result.team,
          project: Option.getOrNull(result.project),
          workspace: Option.getOrNull(result.workspace),
          timezone: Option.getOrNull(result.timezone),
          files: result.files,
          labels: result.labels,
        })
      }
      yield* writeLine(`Linked ${result.team.key}: ${result.team.name} (${result.team.id})`)
      if (Option.isSome(result.timezone)) {
        yield* writeLine(
          `Updated timezone: ${result.timezone.value.previous} -> ${result.timezone.value.current}`,
        )
      }
      yield* Effect.forEach(result.files, (file) => writeLine(formatFile(file)), { discard: true })
      yield* writeLine(
        `created labels: ${formatNames(result.labels.created.map((label) => label.name))}`,
      )
      yield* writeLine(
        `existing labels: ${formatNames(result.labels.existing.map((label) => label.name))}`,
      )
      yield* writeLine("")
      yield* writeLine("Next steps:")
      yield* writeLine("  - Confirm the connection: `rata whoami`.")
      return yield* writeLine("  - List the issues: `rata issue list`.")
    }).pipe(Effect.catch(reportFailure)),
).pipe(
  Command.withDescription("Bind this repository to a Linear team and set its timezone"),
  Command.withExamples([
    {
      command: "rata link",
      description: "Choose the workspace and the team interactively",
    },
    {
      command: "rata link --team RAT --project rata",
      description: "Link the repository to a team found in the stored workspaces",
    },
    {
      command: 'rata link --team SCR --create --name "Scratch"',
      description: "Create the team, then link the repository",
    },
    {
      command: "rata link --workspace work --team RAT",
      description: "Link to a team in the work workspace",
    },
  ]),
)

export { linkCommand }
