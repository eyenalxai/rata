import type { Stdio } from "effect"

import { Console, Effect, Option, Pull, Schema, Stream } from "effect"

import type { Team, TeamOperations } from "@/api/team"

import { parseTeamAnswer } from "@/domain/link"
import { isUuid } from "@/domain/ref"

const maxPromptAttempts = 3

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

type LineReader = () => Effect.Effect<string, LinkError>

type LinkTeamDependencies = {
  readonly teams: TeamOperations
  readonly stdio: Stdio.Stdio
  readonly nextLine: LineReader
}

type PromptInput<A> = {
  readonly question: string
  readonly parse: (answer: string) => Option.Option<A>
  readonly invalidMessage: (answer: string) => string
  readonly failureMessage: string
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

const makeLineReader = Effect.fnUntraced(function* makeLineReader(stdio: Stdio.Stdio) {
  const pull = yield* Stream.toPull(stdio.stdin.pipe(Stream.decodeText(), Stream.splitLines))
  let pending: string[] = []
  const nextLine = Effect.fnUntraced(function* nextLine() {
    while (pending.length === 0) {
      const chunk = yield* pull.pipe(
        Pull.catchDone(() =>
          Effect.fail(new LinkError({ message: "Standard input ended before an answer." })),
        ),
        Effect.mapError(
          (cause) => new LinkError({ message: "Could not read standard input.", cause }),
        ),
      )
      pending = [...chunk]
    }
    const line = pending[0] ?? ""
    pending = pending.slice(1)
    return line
  })
  return nextLine
})

const promptForChoice = <A>(
  nextLine: LineReader,
  input: PromptInput<A>,
): Effect.Effect<A, LinkError> =>
  Effect.gen(function* readChoice() {
    let attempt = 0
    while (attempt < maxPromptAttempts) {
      yield* Console.log(input.question)
      const answer = yield* nextLine()
      const selected = input.parse(answer)
      if (Option.isSome(selected)) {
        return selected.value
      }
      yield* Console.log(input.invalidMessage(answer))
      attempt += 1
    }
    return yield* new LinkError({ message: input.failureMessage })
  })

const promptForTeam = Effect.fn("LinkTeam.promptForTeam")(function* promptForTeam(
  deps: LinkTeamDependencies,
) {
  const isTerminal = yield* deps.stdio.stdinIsTerminal
  if (!isTerminal) {
    return yield* new LinkError({
      message: "Standard input is not a terminal. Pass --team <key> instead.",
    })
  }
  const all = yield* deps.teams.list
  if (all.length === 0) {
    return yield* new LinkError({
      message:
        "No teams in the workspace. Run `rata link --team <key> --create --name <name>` to create one.",
    })
  }
  yield* Console.log("Select a team:")
  yield* Effect.forEach(
    all,
    (team, index) => Console.log(`  ${index + 1}. ${team.key}  ${team.name}`),
    { discard: true },
  )
  return yield* promptForChoice(deps.nextLine, {
    question: "Team number or key:",
    parse: (answer) => parseTeamAnswer(all, answer),
    invalidMessage: (answer) => `Not a team: ${answer.trim()}.`,
    failureMessage: "No valid team selected. Run `rata link --team <key>` to link directly.",
  })
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
  type LineReader,
  type LinkTargetOptions,
  type LinkTeamDependencies,
  makeLineReader,
  promptForChoice,
  resolveLinkTeam,
  type TimezoneChange,
  updateTeamTimezone,
}
