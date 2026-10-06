import { Effect, Option } from "effect"
import { Command, Flag } from "effect/cli"
import { EOL } from "node:os"

import { LabelService } from "@/api/label"
import { maxPageSize } from "@/api/pagination"
import { TeamService } from "@/api/team"
import { errorLine, nextPageHint, reportFailure, writeJson, writeLine } from "@/cli/output"

const jsonFlag = Flag.Boolean("json").pipe(
  Flag.withDescription("Print machine-readable JSON"),
  Flag.withDefault(false),
)

const teamFlag = Flag.String("team").pipe(Flag.withDescription("Team key, for example RAT"))

const limitFlag = Flag.Int("limit").pipe(
  Flag.withDescription("Maximum number of labels to return"),
  Flag.withDefault(50),
)

const afterFlag = Flag.String("after").pipe(
  Flag.withDescription("Continue from the endCursor of a previous page"),
  Flag.optional,
)

const listCommand = Command.make(
  "list",
  { json: jsonFlag, team: teamFlag, limit: limitFlag, after: afterFlag },
  (config) =>
    Effect.gen(function* listLabels() {
      if (config.limit < 1) {
        return yield* errorLine(1, "The --limit flag must be at least 1.")
      }
      if (config.limit > maxPageSize) {
        return yield* errorLine(1, `The --limit flag must be at most ${maxPageSize}.`)
      }
      const teams = yield* TeamService
      const labels = yield* LabelService
      const team = yield* teams.byKey(config.team)
      const page = yield* labels.list(team.id, {
        after: Option.getOrNull(config.after),
        limit: config.limit,
      })
      if (config.json) {
        return yield* writeJson({ labels: page.nodes, pageInfo: page.pageInfo })
      }
      if (page.nodes.length === 0) {
        return yield* writeLine("No labels.")
      }
      const body = page.nodes.map((label) => `${label.name}\t${label.id}`).join(EOL)
      const hint =
        page.pageInfo.hasNextPage && page.pageInfo.endCursor !== null
          ? `${EOL}${nextPageHint("labels", page.pageInfo.endCursor)}`
          : ""
      return yield* writeLine(`${body}${hint}`)
    }).pipe(Effect.catch(reportFailure)),
).pipe(Command.withDescription("List the labels of a team"))

const labelCommand = Command.make("label").pipe(
  Command.withDescription("Inspect the labels of a team"),
  Command.withSubcommands([listCommand]),
)

export { labelCommand }
