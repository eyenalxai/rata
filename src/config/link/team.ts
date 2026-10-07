import type { Stdio } from "effect"

import { Effect, Option, Schema } from "effect"
import { Prompt } from "effect/cli"

import type { Team, TeamOperations } from "@/api/team"

import { collectConnection, pageSize } from "@/api/pagination"
import { runPrompt } from "@/config/prompt"
import { isUuid } from "@/domain/ref"

type LinkTargetOptions = {
  readonly team: Option.Option<string>
  readonly workspace: Option.Option<string>
  readonly create: boolean
  readonly name: Option.Option<string>
  readonly timezone: Option.Option<string>
}

type TimezoneChange = {
  readonly previous: string
  readonly current: string
}

type LinkTeamDependencies = {
  readonly teams: TeamOperations
  readonly stdio: Stdio.Stdio
}

class LinkError extends Schema.TaggedError<LinkError>()("LinkError", {
  message: Schema.String,
  cause: Schema.optional(Schema.Defect()),
}) {}

const invalidLinkOptions = (options: LinkTargetOptions): Option.Option<LinkError> => {
  if (options.create && Option.isNone(options.team)) {
    return Option.some(new LinkError({ message: "`--create` needs `--team <key>`." }))
  }
  if (options.create && Option.isNone(options.name)) {
    return Option.some(new LinkError({ message: "`--create` needs `--name <team name>`." }))
  }
  if (!options.create && Option.isSome(options.name)) {
    return Option.some(new LinkError({ message: "`--name` only applies with `--create`." }))
  }
  if (options.create && Option.exists(options.team, isUuid)) {
    return Option.some(new LinkError({ message: "`--create` needs a team key, not an id." }))
  }
  return Option.none()
}

const promptForTeam = Effect.fn("LinkTeam.promptForTeam")(function* promptForTeam(
  deps: LinkTeamDependencies,
) {
  const isTerminal = yield* deps.stdio.stdinIsTerminal
  if (!isTerminal) {
    return yield* new LinkError({
      message: "Standard input is not a terminal. Pass --team <key> instead.",
    })
  }
  const all = yield* collectConnection((after) => deps.teams.list({ after, limit: pageSize }))
  if (all.length === 0) {
    return yield* new LinkError({
      message:
        "No teams in the workspace. Run `rata link --team <key> --create --name <name>` to create one.",
    })
  }
  return yield* runPrompt(
    Prompt.Select({
      message: "Select a team",
      choices: all.map((team) => ({ title: `${team.key}  ${team.name}`, value: team })),
    }),
  )
})

const resolveTeamTarget = Effect.fn("LinkTeam.resolveTarget")(function* resolveTeamTarget(
  options: LinkTargetOptions,
  deps: LinkTeamDependencies,
) {
  if (Option.isNone(options.team)) {
    return yield* promptForTeam(deps)
  }
  const value = options.team.value
  if (isUuid(value)) {
    return yield* deps.teams.byId(value)
  }
  return yield* deps.teams.byKey(value).pipe(
    Effect.catchTag("TeamNotFoundError", (error) => {
      if (options.create && Option.isSome(options.name)) {
        return deps.teams.create({
          name: options.name.value,
          key: value,
          timezone: Option.getOrUndefined(options.timezone),
        })
      }
      return Effect.fail(error)
    }),
  )
})

const updateTeamTimezone = Effect.fn("LinkTeam.updateTimezone")(function* updateTeamTimezone(
  team: Team,
  timezone: Option.Option<string>,
  teams: TeamOperations,
) {
  const machine = Option.getOrUndefined(timezone)
  if (machine === undefined || machine === team.timezone) {
    return { team, timezone: Option.none<TimezoneChange>() }
  }
  const updated = yield* teams.updateTimezone(team, machine)
  return {
    team: updated,
    timezone: Option.some({ previous: team.timezone, current: updated.timezone }),
  }
})

const resolveLinkTeam = Effect.fn("LinkTeam.resolve")(function* resolveLinkTeam(
  options: LinkTargetOptions,
  deps: LinkTeamDependencies,
) {
  const team = yield* resolveTeamTarget(options, deps)
  return yield* updateTeamTimezone(team, options.timezone, deps.teams)
})

export {
  invalidLinkOptions,
  LinkError,
  type LinkTargetOptions,
  type LinkTeamDependencies,
  resolveLinkTeam,
  type TimezoneChange,
  updateTeamTimezone,
}
