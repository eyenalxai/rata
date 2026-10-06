import { Effect, Option } from "effect"
import { Argument, Command, Flag } from "effect/cli"
import { EOL } from "node:os"

import { maxPageSize } from "@/api/pagination"
import { TeamService } from "@/api/team"
import { confirm } from "@/cli/confirm"
import { nextPageHint, reportFailure, validatePageSize, writeJson, writeLine } from "@/cli/output"
import { machineTimezone } from "@/domain/timezone"

const jsonFlag = Flag.Boolean("json").pipe(
  Flag.withDescription("Print machine-readable JSON"),
  Flag.withDefault(false),
)

const optionalText = (name: string, description: string) =>
  Flag.String(name).pipe(Flag.withDescription(description), Flag.optional)

const limitFlag = Flag.Int("limit").pipe(
  Flag.withDescription(`Page size, at most ${maxPageSize}`),
  Flag.withDefault(50),
)

const afterFlag = Flag.String("after").pipe(
  Flag.withDescription("Continue after this cursor"),
  Flag.optional,
)

const listCommand = Command.make(
  "list",
  { json: jsonFlag, limit: limitFlag, after: afterFlag },
  (config) =>
    Effect.gen(function* listTeams() {
      const valid = yield* validatePageSize(config.limit)
      if (!valid) {
        return
      }
      const teams = yield* TeamService
      const page = yield* teams.list({
        after: Option.getOrNull(config.after),
        limit: config.limit,
      })
      if (config.json) {
        yield* writeJson({ teams: page.nodes, pageInfo: page.pageInfo })
        return
      }
      if (page.nodes.length === 0) {
        yield* writeLine("No teams.")
        return
      }
      const body = page.nodes.map((team) => `${team.key}\t${team.name}\t${team.id}`).join(EOL)
      const hint =
        page.pageInfo.hasNextPage && page.pageInfo.endCursor !== null
          ? `${EOL}${nextPageHint("teams", page.pageInfo.endCursor)}`
          : ""
      yield* writeLine(`${body}${hint}`)
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
        timezone: Option.getOrUndefined(machineTimezone()),
      })
      if (config.json) {
        return yield* writeJson({ team })
      }
      return yield* writeLine(`Created ${team.key}: ${team.name} (${team.id})`)
    }).pipe(Effect.catch(reportFailure)),
).pipe(
  Command.withDescription("Create a team with the machine timezone"),
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

const deleteCommand = Command.make(
  "delete",
  {
    key: Argument.String("key").pipe(Argument.withDescription("Team key or id")),
    yes: Flag.Boolean("yes").pipe(
      Flag.withDescription("Skip the confirmation prompt"),
      Flag.withDefault(false),
    ),
    json: jsonFlag,
  },
  (config) =>
    Effect.gen(function* deleteTeam() {
      const teams = yield* TeamService
      const team = yield* teams.byKey(config.key)
      const confirmed = yield* confirm(`Delete team ${team.key} (${team.name})?`, config.yes)
      if (!confirmed) {
        return yield* writeLine("Aborted.")
      }
      const deleted = yield* teams.delete(team)
      if (config.json) {
        return yield* writeJson({ deleted: { id: deleted.id, key: deleted.key } })
      }
      return yield* writeLine(`Deleted ${deleted.key}: ${deleted.name} (${deleted.id}).`)
    }).pipe(Effect.catch(reportFailure)),
).pipe(
  Command.withDescription("Delete a team"),
  Command.withExamples([
    {
      command: "rata team delete SCR",
      description: "Delete a team after a confirmation prompt",
    },
    {
      command: "rata team delete SCR --yes",
      description: "Delete a team without a prompt",
    },
  ]),
)

const teamCommand = Command.make("team").pipe(
  Command.withDescription("Inspect, create and delete the teams in the workspace"),
  Command.withSubcommands([listCommand, createCommand, deleteCommand]),
)

export { teamCommand }
