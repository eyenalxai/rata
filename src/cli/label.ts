import { Effect, Option } from "effect"
import { Argument, Command, Flag } from "effect/cli"
import { EOL } from "node:os"

import { LabelService } from "@/api/label"
import { RepoTeam } from "@/api/repo-team"
import { resolveColor } from "@/cli/color"
import { objectField, scalarField } from "@/cli/field/shape"
import { OutputFields } from "@/cli/fields"
import { requirePageSize } from "@/cli/input"
import { afterFlag, allFlag, limitFlag } from "@/cli/list-flags"
import { JsonOutput, nextPageHint } from "@/cli/output"
import { Format, buildCommand, buildGroup, OutputSelect } from "@/cli/runner"
import { collectionOutput, defineCommand, resourceOutput } from "@/cli/spec"
import { TrackerError } from "@/domain/error"

const teamFlag = Flag.String("team").pipe(
  Flag.withDescription("Team key or id. Defaults to the team from `rata link`"),
  Flag.optional,
)

const labelShape = objectField({
  id: scalarField,
  name: scalarField,
  color: scalarField,
})

const optionalText = (name: string, description: string) =>
  Flag.String(name).pipe(Flag.withDescription(description), Flag.optional)

const colorFlag = optionalText(
  "color",
  "Label color: 6 hex digits, with or without #. For example #EB5757",
)

const listCommand = buildCommand(
  defineCommand("list", {
    summary: "List the labels of a team",
    input: { team: teamFlag, limit: limitFlag, after: afterFlag, all: allFlag },
    output: collectionOutput(labelShape),
    run: (input) =>
      Effect.gen(function* listLabels() {
        yield* requirePageSize(input.limit)
        const labels = yield* LabelService
        const repoTeam = yield* RepoTeam
        const teamId = yield* repoTeam.resolve(Option.getOrUndefined(input.team))
        const page = yield* labels.list(teamId, {
          after: Option.getOrNull(input.after),
          limit: input.limit,
          all: input.all,
        })
        const hint =
          page.pageInfo.hasNextPage && page.pageInfo.endCursor !== null
            ? `${EOL}${nextPageHint("labels", page.pageInfo.endCursor)}`
            : ""
        const text =
          page.nodes.length === 0
            ? ["No labels."]
            : [
                page.nodes.map((label) => `${label.name}\t${label.id}\t${label.color}`).join(EOL) +
                  hint,
              ]
        return {
          kind: "collection",
          key: "labels",
          items: page.nodes,
          pageInfo: page.pageInfo,
          text,
        }
      }),
  }),
).pipe(Command.withGlobalFlags([JsonOutput, OutputFields, Format, OutputSelect]))

const createCommand = buildCommand(
  defineCommand("create", {
    summary: "Create a label",
    examples: [
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
    ],
    input: {
      name: Flag.String("name").pipe(Flag.withDescription("Label name")),
      color: colorFlag,
      team: optionalText("team", "Team key or id. Defaults to the team from `rata link`"),
      ifNotExists: Flag.Boolean("if-not-exists").pipe(
        Flag.withDescription("Return the existing label instead of failing on a duplicate name"),
        Flag.withDefault(false),
      ),
    },
    output: resourceOutput(objectField({ label: scalarField, created: scalarField })),
    run: (input) =>
      Effect.gen(function* createLabel() {
        const color = yield* resolveColor(input.color)
        const labels = yield* LabelService
        const result = yield* labels.create({
          name: input.name,
          color: Option.getOrUndefined(color),
          team: Option.getOrUndefined(input.team),
          ifNotExists: input.ifNotExists,
        })
        return {
          kind: "resource",
          value: { label: result.label, created: result.created },
          text: [
            result.created
              ? `Created label ${result.label.name}.`
              : `Label ${result.label.name} already exists.`,
          ],
        }
      }),
  }),
).pipe(Command.withGlobalFlags([JsonOutput, OutputFields, Format, OutputSelect]))

const editCommand = buildCommand(
  defineCommand("edit", {
    summary: "Update a label",
    examples: [
      {
        command: 'rata label edit bug --color "#0F783C"',
        description: "Change the color of a label",
      },
      {
        command: "rata label edit bug --name regression --team RAT",
        description: "Rename a label",
      },
    ],
    input: {
      label: Argument.String("label").pipe(
        Argument.withDescription("Label reference: a name or a UUID"),
      ),
      name: optionalText("name", "New label name"),
      color: colorFlag,
      team: optionalText("team", "Team key or id. Defaults to the team from `rata link`"),
    },
    output: resourceOutput(objectField({ label: scalarField })),
    run: (input) =>
      Effect.gen(function* editLabel() {
        const color = yield* resolveColor(input.color)
        const name = Option.getOrUndefined(input.name)
        const colorValue = Option.getOrUndefined(color)
        if (name === undefined && colorValue === undefined) {
          return yield* new TrackerError({
            code: "validation",
            message: "Pass at least one of --name or --color.",
            hint: null,
          })
        }
        const labels = yield* LabelService
        const label = yield* labels.update(input.label, {
          name,
          color: colorValue,
          team: Option.getOrUndefined(input.team),
        })
        return {
          kind: "resource",
          value: { label },
          text: [`Updated label ${label.name}.`],
        }
      }),
  }),
).pipe(Command.withGlobalFlags([JsonOutput, OutputFields, Format, OutputSelect]))

const labelCommand = buildGroup("label", "Create and inspect the labels of a team", [
  listCommand,
  createCommand,
  editCommand,
]).pipe(Command.withGlobalFlags([JsonOutput, OutputFields, Format, OutputSelect]))

export { labelCommand }
