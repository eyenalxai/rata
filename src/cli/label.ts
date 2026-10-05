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

const formatNames = (names: readonly string[]): string =>
  names.length === 0 ? "none" : names.join(", ")

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

const ensureCommand = Command.make("ensure", { json: jsonFlag, team: teamFlag }, (config) =>
  Effect.gen(function* ensureLabels() {
    const teams = yield* TeamService
    const labels = yield* LabelService
    const team = yield* teams.byKey(config.team)
    const result = yield* labels.ensure(team.id)
    if (config.json) {
      return yield* writeJson(result)
    }
    yield* writeLine(`created: ${formatNames(result.created.map((label) => label.name))}`)
    return yield* writeLine(`existing: ${formatNames(result.existing.map((label) => label.name))}`)
  }).pipe(Effect.catch(reportFailure)),
).pipe(Command.withDescription("Create the canonical labels that a team misses"))

const labelCommand = Command.make("label").pipe(
  Command.withDescription("Inspect and set up the labels of a team"),
  Command.withSubcommands([listCommand, ensureCommand]),
)

export { labelCommand }
