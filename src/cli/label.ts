import { Effect, Option } from "effect"
import { Argument, Command, Flag } from "effect/cli"
import { EOL } from "node:os"

import { LabelService } from "@/api/label"
import { maxPageSize } from "@/api/pagination"
import { TeamService } from "@/api/team"
import { resolveColor } from "@/cli/color"
import {
  errorLine,
  nextPageHint,
  reportFailure,
  validatePageSize,
  writeJson,
  writeLine,
} from "@/cli/output"

const jsonFlag = Flag.Boolean("json").pipe(
  Flag.withDescription("Print machine-readable JSON"),
  Flag.withDefault(false),
)

const teamFlag = Flag.String("team").pipe(Flag.withDescription("Team key, for example RAT"))

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
  { json: jsonFlag, team: teamFlag, limit: limitFlag, after: afterFlag },
  (config) =>
    Effect.gen(function* listLabels() {
      const valid = yield* validatePageSize(config.limit)
      if (!valid) {
        return
      }
      const teams = yield* TeamService
      const labels = yield* LabelService
      const team = yield* teams.byKey(config.team)
      const page = yield* labels.list(team.id, {
        after: Option.getOrNull(config.after),
        limit: config.limit,
      })
      if (config.json) {
        yield* writeJson({ labels: page.nodes, pageInfo: page.pageInfo })
        return
      }
      if (page.nodes.length === 0) {
        yield* writeLine("No labels.")
        return
      }
      const body = page.nodes.map((label) => `${label.name}\t${label.id}\t${label.color}`).join(EOL)
      const hint =
        page.pageInfo.hasNextPage && page.pageInfo.endCursor !== null
          ? `${EOL}${nextPageHint("labels", page.pageInfo.endCursor)}`
          : ""
      yield* writeLine(`${body}${hint}`)
    }).pipe(Effect.catch(reportFailure)),
).pipe(Command.withDescription("List the labels of a team"))

const optionalText = (name: string, description: string) =>
  Flag.String(name).pipe(Flag.withDescription(description), Flag.optional)

const colorFlag = optionalText(
  "color",
  "Label color: 6 hex digits, with or without #. For example #EB5757",
)

const createCommand = Command.make(
  "create",
  {
    name: Flag.String("name").pipe(Flag.withDescription("Label name")),
    color: colorFlag,
    team: optionalText("team", "Team key or id. Defaults to the team from `rata link`"),
    json: jsonFlag,
  },
  (config) =>
    Effect.gen(function* createLabel() {
      const color = yield* resolveColor(config.color)
      const labels = yield* LabelService
      const label = yield* labels.create({
        name: config.name,
        color: Option.getOrUndefined(color),
        team: Option.getOrUndefined(config.team),
      })
      if (config.json) {
        return yield* writeJson({ label })
      }
      return yield* writeLine(`Created label ${label.name}.`)
    }).pipe(Effect.catch(reportFailure)),
).pipe(
  Command.withDescription("Create a label"),
  Command.withExamples([
    {
      command: 'rata label create --team RAT --name bug --color "#EB5757"',
      description: "Create a label with a color",
    },
    {
      command: "rata label create --team RAT --name bug",
      description: "Create a label and let Linear pick the color",
    },
  ]),
)

const editCommand = Command.make(
  "edit",
  {
    label: Argument.String("label").pipe(
      Argument.withDescription("Label reference: a name or a UUID"),
    ),
    name: optionalText("name", "New label name"),
    color: colorFlag,
    team: optionalText("team", "Team key or id. Defaults to the team from `rata link`"),
    json: jsonFlag,
  },
  (config) =>
    Effect.gen(function* editLabel() {
      const color = yield* resolveColor(config.color)
      const name = Option.getOrUndefined(config.name)
      const colorValue = Option.getOrUndefined(color)
      if (name === undefined && colorValue === undefined) {
        return yield* errorLine(1, "Pass at least one of --name or --color.")
      }
      const labels = yield* LabelService
      const label = yield* labels.update(config.label, {
        name,
        color: colorValue,
        team: Option.getOrUndefined(config.team),
      })
      if (config.json) {
        return yield* writeJson({ label })
      }
      return yield* writeLine(`Updated label ${label.name}.`)
    }).pipe(Effect.catch(reportFailure)),
).pipe(
  Command.withDescription("Update a label"),
  Command.withExamples([
    {
      command: 'rata label edit bug --color "#0F783C"',
      description: "Change the color of a label",
    },
    {
      command: "rata label edit bug --name regression --team RAT",
      description: "Rename a label",
    },
  ]),
)

const labelCommand = Command.make("label").pipe(
  Command.withDescription("Create and inspect the labels of a team"),
  Command.withSubcommands([listCommand, createCommand, editCommand]),
)

export { labelCommand }
