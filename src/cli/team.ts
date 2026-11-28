import { Effect, Option } from "effect"
import { Argument, Flag } from "effect/cli"
import { EOL } from "node:os"

import type { TeamDetail } from "@/linear/decode/team"

import { TeamResolutionError, TeamService } from "@/api/team"
import { confirm } from "@/cli/confirm"
import { arrayField, objectField, scalarField } from "@/cli/field/shape"
import { requirePageSize } from "@/cli/input"
import { afterFlag, allFlag, limitFlag } from "@/cli/list-flags"
import { nextPageHint } from "@/cli/output"
import {
  collectionOutput,
  defineCommand,
  resourceOutput,
  selectOutput,
  textOutput,
} from "@/cli/spec"
import { currentDirectory, RepoConfigService } from "@/config/repo"
import { machineTimezone } from "@/domain/timezone"

const optionalText = (name: string, description: string) =>
  Flag.String(name).pipe(Flag.withDescription(description), Flag.optional)

const teamSummaryShape = objectField({
  id: scalarField,
  key: scalarField,
  name: scalarField,
  timezone: scalarField,
})

const teamDetailShape = objectField({
  id: scalarField,
  key: scalarField,
  name: scalarField,
  timezone: scalarField,
  states: arrayField(
    objectField({
      id: scalarField,
      name: scalarField,
      type: scalarField,
      position: scalarField,
    }),
  ),
  labels: arrayField(
    objectField({
      id: scalarField,
      name: scalarField,
      color: scalarField,
      scope: scalarField,
    }),
  ),
  members: arrayField(
    objectField({
      id: scalarField,
      name: scalarField,
      displayName: scalarField,
      email: scalarField,
    }),
  ),
  priorities: arrayField(
    objectField({
      priority: scalarField,
      label: scalarField,
    }),
  ),
})

const teamListSpec = defineCommand("list", {
  summary: "List the teams in the workspace",
  input: { limit: limitFlag, after: afterFlag, all: allFlag },
  output: collectionOutput(teamSummaryShape),
  run: (input) =>
    Effect.gen(function* listTeams() {
      yield* requirePageSize(input.limit)
      const teams = yield* TeamService
      const page = yield* teams.list({
        after: Option.getOrNull(input.after),
        limit: input.limit,
        all: input.all,
      })
      const hint =
        page.pageInfo.hasNextPage && page.pageInfo.endCursor !== null
          ? `${EOL}${nextPageHint("teams", page.pageInfo.endCursor)}`
          : ""
      const text =
        page.nodes.length === 0
          ? ["No teams."]
          : [page.nodes.map((team) => `${team.key}\t${team.name}\t${team.id}`).join(EOL) + hint]
      return {
        kind: "collection",
        key: "teams",
        items: page.nodes,
        pageInfo: page.pageInfo,
        text,
      }
    }),
})

const teamCreateSpec = defineCommand("create", {
  summary: "Create a team with the machine timezone",
  examples: [
    {
      command: 'rata admin team create --name "Scratch" --key SCR',
      description: "Create a team with an explicit key",
    },
    {
      command: 'rata admin team create --name "Scratch" --copy-settings-from RAT',
      description: "Create a team that copies another team's settings",
    },
  ],
  input: {
    name: Flag.String("name").pipe(Flag.withDescription("Team name")),
    key: optionalText("key", "Team key, for example RAT"),
    description: optionalText("description", "Team description"),
    copySettingsFrom: optionalText("copy-settings-from", "Team key or id to copy settings from"),
  },
  output: resourceOutput(objectField({ team: scalarField })),
  run: (input) =>
    Effect.gen(function* createTeam() {
      const teams = yield* TeamService
      const team = yield* teams.create({
        name: input.name,
        key: Option.getOrUndefined(input.key),
        description: Option.getOrUndefined(input.description),
        copySettingsFrom: Option.getOrUndefined(input.copySettingsFrom),
        timezone: Option.getOrUndefined(machineTimezone()),
      })
      return {
        kind: "resource",
        value: { team },
        text: [`Created ${team.key}: ${team.name} (${team.id})`],
      }
    }),
})

const teamDeleteSpec = defineCommand("delete", {
  summary: "Delete a team",
  examples: [
    {
      command: "rata admin team delete SCR",
      description: "Delete a team after a confirmation prompt",
    },
    {
      command: "rata admin team delete SCR --yes",
      description: "Delete a team without a prompt",
    },
  ],
  input: {
    key: Argument.String("key").pipe(Argument.withDescription("Team key or id")),
    yes: Flag.Boolean("yes").pipe(
      Flag.withDescription("Skip the confirmation prompt"),
      Flag.withDefault(false),
    ),
  },
  output: [resourceOutput(objectField({ deleted: scalarField })), textOutput],
  run: (input) =>
    Effect.gen(function* deleteTeam() {
      const teams = yield* TeamService
      const team = yield* teams.byKey(input.key)
      const confirmed = yield* confirm(`Delete team ${team.key} (${team.name})?`, input.yes)
      if (!confirmed) {
        return { kind: "text", lines: ["Aborted."] }
      }
      const deleted = yield* teams.delete(team)
      return {
        kind: "resource",
        value: { deleted: { id: deleted.id, key: deleted.key } },
        text: [`Deleted ${deleted.key}: ${deleted.name} (${deleted.id}).`],
      }
    }),
})

const block = (title: string, rows: readonly string[]): string =>
  [title, ...rows.map((row) => `  ${row}`)].join(EOL)

const showTeamText = (team: TeamDetail): string =>
  [
    `${team.key}  ${team.name} (${team.id})`,
    `timezone: ${team.timezone}`,
    block(
      "states:",
      team.states.map((state) => `${state.name}\t${state.type}\t${state.position}`),
    ),
    block(
      "labels:",
      team.labels.map((label) => `${label.name}\t${label.color}\t${label.scope}`),
    ),
    block(
      "members:",
      team.members.map((member) => `${member.name}\t${member.displayName}\t${member.email}`),
    ),
    block(
      "priorities:",
      team.priorities.map((priority) => `${priority.priority}\t${priority.label}`),
    ),
  ].join(`${EOL}${EOL}`)

const teamShowSpec = defineCommand("show", {
  summary: "Show the states, labels, members and priorities of a team",
  examples: [
    {
      command: "rata admin team show RAT",
      description: "Show the team named by its key",
    },
    {
      command: "rata admin team show --format json",
      description: "Show the linked team for an agent",
    },
  ],
  input: {
    ref: Argument.String("ref").pipe(
      Argument.withDescription("Team key or id. Default: the linked team"),
      Argument.optional,
    ),
  },
  output: selectOutput(teamDetailShape),
  run: (input) =>
    Effect.gen(function* showTeam() {
      const repoConfig = yield* RepoConfigService
      const linked = Option.getOrUndefined(yield* repoConfig.read(yield* currentDirectory))
      const ref = Option.isSome(input.ref) ? input.ref.value : linked?.team
      if (ref === undefined) {
        return yield* new TeamResolutionError({
          message: "No team. Pass a team key or id, or run `rata admin link`.",
        })
      }
      const teams = yield* TeamService
      const detail = yield* teams.details(ref)
      return {
        kind: "resource",
        value: detail,
        text: [showTeamText(detail)],
      }
    }),
})

export { teamCreateSpec, teamDeleteSpec, teamListSpec, teamShowSpec }
