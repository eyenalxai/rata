import type { Stdio } from "effect"

import { Console, Effect, Option, Pull, Schema, Stream } from "effect"

import type { TeamService } from "@/api/team"

import { parseTeamAnswer } from "@/domain/link"
import { isUuid } from "@/domain/ref"

const maxPromptAttempts = 3

type LinkTargetOptions = {
  readonly team: Option.Option<string>
  readonly create: boolean
  readonly name: Option.Option<string>
}

type LinkTeamDependencies = {
  readonly teams: TeamService["Service"]
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
  return yield* Effect.scoped(
    Effect.gen(function* selectTeam() {
      const pull = yield* Stream.toPull(
        deps.stdio.stdin.pipe(Stream.decodeText(), Stream.splitLines),
      )
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
      let attempt = 0
      while (attempt < maxPromptAttempts) {
        yield* Console.log("Team number or key:")
        const answer = yield* nextLine()
        const selected = parseTeamAnswer(all, answer)
        if (Option.isSome(selected)) {
          return selected.value
        }
        yield* Console.log(`Not a team: ${answer.trim()}.`)
        attempt += 1
      }
      return yield* new LinkError({
        message: "No valid team selected. Run `rata link --team <key>` to link directly.",
      })
    }),
  )
})

const resolveLinkTeam = Effect.fn("LinkTeam.resolve")(function* resolveLinkTeam(
  options: LinkTargetOptions,
  deps: LinkTeamDependencies,
) {
  if (Option.isNone(options.team)) {
    return yield* promptForTeam(deps)
  }
  const value = options.team.value
  if (isUuid(value)) {
    if (options.create) {
      return yield* new LinkError({ message: "`--create` needs a team key, not an id." })
    }
    return yield* deps.teams.byId(value)
  }
  return yield* deps.teams.byKey(value).pipe(
    Effect.catchTag("TeamNotFoundError", (error) => {
      if (options.create && Option.isSome(options.name)) {
        return deps.teams.create({ name: options.name.value, key: value })
      }
      return Effect.fail(error)
    }),
  )
})

export {
  invalidLinkOptions,
  LinkError,
  resolveLinkTeam,
  type LinkTargetOptions,
  type LinkTeamDependencies,
}
