import { Effect, Option } from "effect"
import { Argument, Command, Flag } from "effect/cli"
import { EOL } from "node:os"

import { LabelService } from "@/api/label"
import { RepoTeam } from "@/api/repo-team"
import { resolveColor } from "@/cli/color"
import { OutputFields, readFields, rejectFields, selectItems } from "@/cli/fields"
import { afterFlag, allFlag, limitFlag } from "@/cli/list-flags"
import {
  JsonOutput,
  errorLine,
  nextPageHint,
  reportFailure,
  validatePageSize,
  writeJson,
  writeLine,
} from "@/cli/output"

const teamFlag = Flag.String("team").pipe(
  Flag.withDescription("Team key or id. Defaults to the team from `rata link`"),
  Flag.optional,
)

const listCommand = Command.make(
  "list",
  { team: teamFlag, limit: limitFlag, after: afterFlag, all: allFlag },
  (config) =>
    Effect.gen(function* listLabels() {
      const json = yield* JsonOutput
      const fields = yield* readFields(json, yield* OutputFields)
      const valid = yield* validatePageSize(config.limit)
      if (!valid) {
        return
      }
      const labels = yield* LabelService
      const repoTeam = yield* RepoTeam
      const teamId = yield* repoTeam.resolve(Option.getOrUndefined(config.team))
      const page = yield* labels.list(teamId, {
        after: Option.getOrNull(config.after),
        limit: config.limit,
        all: config.all,
      })
      if (json) {
        yield* writeJson({
          labels: yield* selectItems(fields, page.nodes),
          pageInfo: page.pageInfo,
        })
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
    ifNotExists: Flag.Boolean("if-not-exists").pipe(
      Flag.withDescription("Return the existing label instead of failing on a duplicate name"),
      Flag.withDefault(false),
    ),
  },
  (config) =>
    Effect.gen(function* createLabel() {
      const json = yield* JsonOutput
      yield* rejectFields(yield* OutputFields)
      const color = yield* resolveColor(config.color)
      const labels = yield* LabelService
      const result = yield* labels.create({
        name: config.name,
        color: Option.getOrUndefined(color),
        team: Option.getOrUndefined(config.team),
        ifNotExists: config.ifNotExists,
      })
      if (json) {
        return yield* writeJson({ label: result.label, created: result.created })
      }
      return yield* writeLine(
        result.created
          ? `Created label ${result.label.name}.`
          : `Label ${result.label.name} already exists.`,
      )
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
    {
      command: "rata label create --team RAT --name bug --if-not-exists",
      description: "Return the existing label when the name is taken",
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
  },
  (config) =>
    Effect.gen(function* editLabel() {
      const json = yield* JsonOutput
      yield* rejectFields(yield* OutputFields)
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
      if (json) {
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
  Command.withGlobalFlags([JsonOutput, OutputFields]),
)

export { labelCommand }
