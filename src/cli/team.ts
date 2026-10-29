import { Effect, Option } from "effect"
import { Argument, Command, Flag } from "effect/cli"
import { EOL } from "node:os"

import type { TeamDetail } from "@/api/team/details"

import { maxPageSize } from "@/api/pagination"
import { TeamResolutionError, TeamService } from "@/api/team"
import { confirm } from "@/cli/confirm"
import { OutputFields, readFields, rejectFields, selectItems, selectObject } from "@/cli/fields"
import {
  JsonOutput,
  nextPageHint,
  reportFailure,
  validatePageSize,
  writeJson,
  writeLine,
} from "@/cli/output"
import { currentDirectory, RepoConfigService } from "@/config/repo"
import { machineTimezone } from "@/domain/timezone"

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

const listCommand = Command.make("list", { limit: limitFlag, after: afterFlag }, (config) =>
  Effect.gen(function* listTeams() {
    const json = yield* JsonOutput
    const fields = yield* readFields(json, yield* OutputFields)
    const valid = yield* validatePageSize(config.limit)
    if (!valid) {
      return
    }
    const teams = yield* TeamService
    const page = yield* teams.list({
      after: Option.getOrNull(config.after),
      limit: config.limit,
    })
    if (json) {
      yield* writeJson({
        teams: yield* selectItems(fields, page.nodes),
        pageInfo: page.pageInfo,
      })
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
  },
  (config) =>
    Effect.gen(function* createTeam() {
      const json = yield* JsonOutput
      yield* rejectFields(yield* OutputFields)
      const teams = yield* TeamService
      const team = yield* teams.create({
        name: config.name,
        key: Option.getOrUndefined(config.key),
        description: Option.getOrUndefined(config.description),
        copySettingsFrom: Option.getOrUndefined(config.copySettingsFrom),
        timezone: Option.getOrUndefined(machineTimezone()),
      })
      if (json) {
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
  },
  (config) =>
    Effect.gen(function* deleteTeam() {
      const json = yield* JsonOutput
      yield* rejectFields(yield* OutputFields)
      const teams = yield* TeamService
      const team = yield* teams.byKey(config.key)
      const confirmed = yield* confirm(`Delete team ${team.key} (${team.name})?`, config.yes)
      if (!confirmed) {
        return yield* writeLine("Aborted.")
      }
      const deleted = yield* teams.delete(team)
      if (json) {
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

const showCommand = Command.make(
  "show",
  {
    ref: Argument.String("ref").pipe(
      Argument.withDescription("Team key or id. Default: the linked team"),
      Argument.optional,
    ),
  },
  (config) =>
    Effect.gen(function* showTeam() {
      const json = yield* JsonOutput
      const fields = yield* readFields(json, yield* OutputFields)
      const repoConfig = yield* RepoConfigService
      const linked = Option.getOrUndefined(yield* repoConfig.read(yield* currentDirectory))
      const ref = Option.isSome(config.ref) ? config.ref.value : linked?.team
      if (ref === undefined) {
        return yield* new TeamResolutionError({
          message: "No team. Pass a team key or id, or run `rata link`.",
        })
      }
      const teams = yield* TeamService
      const detail = yield* teams.details(ref)
      if (json) {
        return yield* writeJson({ team: yield* selectObject(fields, detail) })
      }
      return yield* writeLine(showTeamText(detail))
    }).pipe(Effect.catch(reportFailure)),
).pipe(
  Command.withDescription("Show the states, labels, members and priorities of a team"),
  Command.withExamples([
    {
      command: "rata team show RAT",
      description: "Show the team named by its key",
    },
    {
      command: "rata team show --json",
      description: "Show the linked team for an agent",
    },
  ]),
)

const teamCommand = Command.make("team").pipe(
  Command.withDescription("Inspect, create and delete the teams in the workspace"),
  Command.withSubcommands([listCommand, showCommand, createCommand, deleteCommand]),
  Command.withGlobalFlags([JsonOutput, OutputFields]),
)

export { teamCommand }
