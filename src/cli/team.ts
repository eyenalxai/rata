import { Effect, Option } from "effect"
import { Command, Flag } from "effect/cli"
import { EOL } from "node:os"

import { TeamService } from "@/api/team"
import { reportFailure, writeJson, writeLine } from "@/cli/output"

const jsonFlag = Flag.Boolean("json").pipe(
  Flag.withDescription("Print machine-readable JSON"),
  Flag.withDefault(false),
)

const optionalText = (name: string, description: string) =>
  Flag.String(name).pipe(Flag.withDescription(description), Flag.optional)

const listCommand = Command.make("list", { json: jsonFlag }, (config) =>
  Effect.gen(function* listTeams() {
    const teams = yield* TeamService
    const all = yield* teams.list
    if (config.json) {
      return yield* writeJson(all)
    }
    if (all.length === 0) {
      return yield* writeLine("No teams.")
    }
    return yield* writeLine(all.map((team) => `${team.key}\t${team.name}\t${team.id}`).join(EOL))
  }).pipe(Effect.catch(reportFailure)),
).pipe(Command.withDescription("List the teams in the workspace"))

const createCommand = Command.make(
  "create",
  {
    name: Flag.String("name").pipe(Flag.withDescription("Team name")),
    key: optionalText("key", "Team key, for example RAT"),
    description: optionalText("description", "Team description"),
    copySettingsFrom: optionalText("copy-settings-from", "Team key or id to copy settings from"),
    json: jsonFlag,
  },
  (config) =>
    Effect.gen(function* createTeam() {
      const teams = yield* TeamService
      const team = yield* teams.create({
        name: config.name,
        key: Option.getOrUndefined(config.key),
        description: Option.getOrUndefined(config.description),
        copySettingsFrom: Option.getOrUndefined(config.copySettingsFrom),
      })
      if (config.json) {
        return yield* writeJson({ team })
      }
      return yield* writeLine(`Created ${team.key}: ${team.name} (${team.id})`)
    }).pipe(Effect.catch(reportFailure)),
).pipe(
  Command.withDescription("Create a team"),
  Command.withExamples([
    {
      command: 'rata team create --name "Scratch" --key SCR',
      description: "Create a team with an explicit key",
    },
    {
      command: 'rata team create --name "Scratch" --copy-settings-from RAT',
      description: "Create a team that copies another team's settings",
    },
  ]),
)

const teamCommand = Command.make("team").pipe(
  Command.withDescription("Inspect and create the teams in the workspace"),
  Command.withSubcommands([listCommand, createCommand]),
)

export { teamCommand }
