import type { Stdio } from "effect"

import { Console, Effect, Option, Redacted } from "effect"

import type { LinearClient, Viewer } from "@/api/client"
import type { LinearApiError } from "@/api/errors"
import type { Team, TeamCreateError, TeamService, TeamUpdateError } from "@/api/team"
import type { Auth, AuthStoreError, StoredProfile } from "@/config/auth"
import type { LineReader, LinkTargetOptions, TimezoneChange } from "@/config/link-team"

import { TeamNotFoundError } from "@/api/team"
import {
  LinkError,
  makeLineReader,
  promptForChoice,
  resolveLinkTeam,
  updateTeamTimezone,
} from "@/config/link-team"
import { parseWorkspaceAnswer } from "@/domain/link"

type LinkTargetDependencies = {
  readonly auth: Auth["Service"]
  readonly client: LinearClient["Service"]
  readonly teams: TeamService["Service"]
  readonly stdio: Stdio.Stdio
}

type ResolvedTargetDependencies = LinkTargetDependencies & {
  readonly profiles: readonly StoredProfile[]
  readonly nextLine: LineReader
}

type LinkTarget = {
  readonly team: Team
  readonly timezone: Option.Option<TimezoneChange>
  readonly workspace: Option.Option<string>
  readonly apiKey: Redacted.Redacted
}

type WorkspaceChoice = {
  readonly name: string
  readonly isDefault: boolean
  readonly apiKey: Redacted.Redacted
  readonly viewer: Viewer
}

type ProfileMatch = {
  readonly profile: StoredProfile
  readonly team: Team
}

const choiceOf = Effect.fn("LinkWorkspace.choice")(function* choiceOf(
  client: LinearClient["Service"],
  profile: StoredProfile,
): Effect.fn.Return<WorkspaceChoice, LinearApiError> {
  const viewer = yield* client.viewerWithKey(profile.apiKey)
  return {
    name: profile.name,
    isDefault: profile.isDefault,
    apiKey: profile.apiKey,
    viewer,
  }
})

const formatWorkspace = (choice: WorkspaceChoice, index: number): string =>
  `  ${choice.isDefault ? "*" : " "} ${index + 1}. ${choice.name}  ${choice.viewer.name} <${choice.viewer.email}>  ${choice.viewer.organization.name}`

const promptForWorkspace = Effect.fn("LinkWorkspace.promptForWorkspace")(
  function* promptForWorkspace(nextLine: LineReader, choices: readonly WorkspaceChoice[]) {
    yield* Console.log("Select a workspace:")
    yield* Effect.forEach(choices, (choice, index) => Console.log(formatWorkspace(choice, index)), {
      discard: true,
    })
    return yield* promptForChoice(nextLine, {
      question: "Workspace number or name:",
      parse: (answer) => parseWorkspaceAnswer(choices, answer),
      invalidMessage: (answer) => `Not a workspace: ${answer.trim()}.`,
      failureMessage: "No valid workspace selected. Run `rata workspace list` to see the profiles.",
    })
  },
)

const searchTeam = Effect.fn("LinkWorkspace.searchTeam")(function* searchTeam(
  key: string,
  deps: {
    readonly profiles: readonly StoredProfile[]
    readonly teams: TeamService["Service"]
  },
) {
  const matches: ProfileMatch[] = []
  const seen = new Set<string>()
  for (const profile of deps.profiles) {
    const secret = Redacted.value(profile.apiKey)
    if (seen.has(secret)) {
      continue
    }
    seen.add(secret)
    const found = yield* deps.teams
      .withKey(profile.apiKey)
      .byKey(key)
      .pipe(
        Effect.asSome,
        Effect.catchTag("TeamNotFoundError", () => Effect.succeed(Option.none<Team>())),
      )
    if (Option.isSome(found)) {
      matches.push({ profile, team: found.value })
    }
  }
  return matches
})

const resolveExplicitWorkspace = Effect.fn("LinkWorkspace.resolveExplicit")(
  function* resolveExplicit(
    name: string,
    options: LinkTargetOptions,
    deps: ResolvedTargetDependencies,
  ) {
    const profile = deps.profiles.find((entry) => entry.name === name)
    if (profile === undefined) {
      return yield* new LinkError({
        message: `No workspace named "${name}" in the auth file. Run \`rata workspace list\` to see the profiles.`,
      })
    }
    const link = yield* resolveLinkTeam(options, {
      teams: deps.teams.withKey(profile.apiKey),
      stdio: deps.stdio,
      nextLine: deps.nextLine,
    })
    return { ...link, workspace: Option.some(name), apiKey: profile.apiKey }
  },
)

const resolveAcrossProfiles = Effect.fn("LinkWorkspace.resolveAcrossProfiles")(
  function* resolveAcrossProfiles(
    key: string,
    options: LinkTargetOptions,
    deps: ResolvedTargetDependencies,
  ) {
    const matches = yield* searchTeam(key, { profiles: deps.profiles, teams: deps.teams })
    if (matches.length > 1) {
      return yield* new LinkError({
        message: `Team ${key} exists in several workspaces: ${matches
          .map((match) => match.profile.name)
          .join(", ")}. Pass --workspace <name> to choose one.`,
      })
    }
    const match = matches[0]
    if (match !== undefined) {
      const link = yield* updateTeamTimezone(
        match.team,
        options.timezone,
        deps.teams.withKey(match.profile.apiKey),
      )
      return { ...link, workspace: Option.some(match.profile.name), apiKey: match.profile.apiKey }
    }
    if (!options.create) {
      return yield* new TeamNotFoundError({
        key,
        message: `No team with key ${key} in the stored workspaces: ${deps.profiles
          .map((profile) => profile.name)
          .join(
            ", ",
          )}. Pass --workspace <name> to search one workspace, or add --create --name <name>.`,
      })
    }
    const resolved = yield* deps.auth.require
    const link = yield* resolveLinkTeam(options, {
      teams: deps.teams.withKey(resolved.key),
      stdio: deps.stdio,
      nextLine: deps.nextLine,
    })
    return { ...link, workspace: resolved.profile, apiKey: resolved.key }
  },
)

const resolveLinkTarget = Effect.fn("LinkWorkspace.resolve")(function* resolveLinkTarget(
  options: LinkTargetOptions,
  deps: LinkTargetDependencies,
): Effect.fn.Return<
  LinkTarget,
  | AuthStoreError
  | LinkError
  | LinearApiError
  | TeamCreateError
  | TeamNotFoundError
  | TeamUpdateError
> {
  const profiles = yield* deps.auth.profiles
  const envKey = yield* deps.auth.envKey

  return yield* Effect.scoped(
    Effect.gen(function* resolveWithInput() {
      const nextLine = yield* makeLineReader(deps.stdio)
      const target: ResolvedTargetDependencies = { ...deps, profiles, nextLine }

      if (Option.isSome(options.workspace)) {
        return yield* resolveExplicitWorkspace(options.workspace.value, options, target)
      }

      if (Option.isSome(envKey)) {
        const link = yield* resolveLinkTeam(options, {
          teams: deps.teams.withKey(envKey.value),
          stdio: deps.stdio,
          nextLine,
        })
        return { ...link, workspace: Option.none(), apiKey: envKey.value }
      }

      if (profiles.length > 0 && Option.isSome(options.team)) {
        return yield* resolveAcrossProfiles(options.team.value, options, target)
      }

      if (profiles.length > 0) {
        const isTerminal = yield* deps.stdio.stdinIsTerminal
        if (isTerminal) {
          const choices = yield* Effect.forEach(profiles, (profile) =>
            choiceOf(deps.client, profile),
          )
          const choice = yield* promptForWorkspace(nextLine, choices)
          const link = yield* resolveLinkTeam(options, {
            teams: deps.teams.withKey(choice.apiKey),
            stdio: deps.stdio,
            nextLine,
          })
          return { ...link, workspace: Option.some(choice.name), apiKey: choice.apiKey }
        }
      }

      const resolved = yield* deps.auth.require
      const link = yield* resolveLinkTeam(options, {
        teams: deps.teams.withKey(resolved.key),
        stdio: deps.stdio,
        nextLine,
      })
      return { ...link, workspace: resolved.profile, apiKey: resolved.key }
    }),
  )
})

export { resolveLinkTarget }
