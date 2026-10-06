import { Effect } from "effect"
import { Command, Flag } from "effect/cli"
import { EOL } from "node:os"

import { LabelService } from "@/api/label"
import { TeamService } from "@/api/team"
import { reportFailure, writeJson, writeLine } from "@/cli/output"

const jsonFlag = Flag.Boolean("json").pipe(
  Flag.withDescription("Print machine-readable JSON"),
  Flag.withDefault(false),
)

const teamFlag = Flag.String("team").pipe(Flag.withDescription("Team key, for example RAT"))

const listCommand = Command.make("list", { json: jsonFlag, team: teamFlag }, (config) =>
  Effect.gen(function* listLabels() {
    const teams = yield* TeamService
    const labels = yield* LabelService
    const team = yield* teams.byKey(config.team)
    const all = yield* labels.list(team.id)
    if (config.json) {
      return yield* writeJson(all)
    }
    if (all.length === 0) {
      return yield* writeLine("No labels.")
    }
    return yield* writeLine(all.map((label) => `${label.name}\t${label.id}`).join(EOL))
  }).pipe(Effect.catch(reportFailure)),
).pipe(Command.withDescription("List the labels of a team"))

const labelCommand = Command.make("label").pipe(
  Command.withDescription("Inspect the labels of a team"),
  Command.withSubcommands([listCommand]),
)

export { labelCommand }
