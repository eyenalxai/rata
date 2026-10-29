import { Effect, Option } from "effect"
import { Command, Flag } from "effect/cli"

import { OutputFields, rejectFields } from "@/cli/fields"
import { JsonOutput, reportFailure, writeJson, writeLine } from "@/cli/output"
import { LinkService } from "@/config/link"
import { machineTimezone } from "@/domain/timezone"

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

const linkCommand = Command.make(
  "link",
  {
    team: teamFlag,
    project: projectFlag,
    workspace: workspaceFlag,
    create: createFlag,
    name: nameFlag,
  },
  (config) =>
    Effect.gen(function* link() {
      const json = yield* JsonOutput
      yield* rejectFields(yield* OutputFields)
      const service = yield* LinkService
      const result = yield* service.link({
        team: config.team,
        project: config.project,
        workspace: config.workspace,
        create: config.create,
        name: config.name,
        timezone: machineTimezone(),
      })
      if (json) {
        return yield* writeJson({
          team: result.team,
          project: Option.getOrNull(result.project),
          workspace: Option.getOrNull(result.workspace),
          timezone: Option.getOrNull(result.timezone),
        })
      }
      yield* writeLine(`Linked ${result.team.key}: ${result.team.name} (${result.team.id})`)
      if (Option.isSome(result.timezone)) {
        yield* writeLine(
          `Updated timezone: ${result.timezone.value.previous} -> ${result.timezone.value.current}`,
        )
      }
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
  Command.withGlobalFlags([JsonOutput, OutputFields]),
)

export { linkCommand }
