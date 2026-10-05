import { Effect } from "effect"
import { Command, Flag } from "effect/cli"
import { EOL } from "node:os"

import { TeamService } from "@/api/team"
import { reportFailure, writeJson, writeLine } from "@/cli/output"

const jsonFlag = Flag.Boolean("json").pipe(
  Flag.withDescription("Print machine-readable JSON"),
  Flag.withDefault(false),
)

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

const teamCommand = Command.make("team").pipe(
  Command.withDescription("Inspect the teams in the workspace"),
  Command.withSubcommands([listCommand]),
)

export { teamCommand }
