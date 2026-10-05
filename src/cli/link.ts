import { Effect, Option } from "effect"
import { Command, Flag } from "effect/cli"

import { formatFile, formatNames, reportFailure, writeJson, writeLine } from "@/cli/output"
import { InitService } from "@/config/init"

const jsonFlag = Flag.Boolean("json").pipe(
  Flag.withDescription("Print machine-readable JSON"),
  Flag.withDefault(false),
)

const teamFlag = Flag.String("team").pipe(Flag.withDescription("Team key or id"), Flag.optional)

const projectFlag = Flag.String("project").pipe(
  Flag.withDescription("Default project name or id for this repository"),
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
        create: config.create,
        name: config.name,
        force: config.force,
      })
      if (config.json) {
        return yield* writeJson({
          team: result.team,
          project: Option.getOrNull(result.project),
          files: result.files,
          labels: result.labels,
        })
      }
      yield* writeLine(`Linked ${result.team.key}: ${result.team.name} (${result.team.id})`)
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
  Command.withDescription("Bind this repository to a Linear team"),
  Command.withExamples([
    {
      command: "rata link --team RAT --project rata",
      description: "Link the repository to an existing team",
    },
    {
      command: 'rata link --team SCR --create --name "Scratch"',
      description: "Create the team, then link the repository",
    },
  ]),
)

export { linkCommand }
