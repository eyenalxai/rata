import type { FileSystem, Path, Stdio, Terminal } from "effect"

import { Effect, Option, Redacted, Result } from "effect"
import { Prompt } from "effect/cli"

import type { LinearClient, Viewer } from "@/api/client"
import type { LinearApiError } from "@/api/errors"
import type { Team, TeamCreateError, TeamService, TeamUpdateError } from "@/api/team"
import type { Auth, AuthStoreError, StoredProfile } from "@/config/auth"
import type { LinkTargetOptions, TimezoneChange } from "@/config/link/team"

import { TeamNotFoundError } from "@/api/team"
import { LinkError, resolveLinkTeam, updateTeamTimezone } from "@/config/link/team"
import { runPrompt } from "@/config/prompt"

type LinkTargetDependencies = {
  readonly auth: Auth["Service"]
  readonly client: LinearClient["Service"]
  readonly teams: TeamService["Service"]
  readonly stdio: Stdio.Stdio
}

type ResolvedTargetDependencies = LinkTargetDependencies & {
  readonly profiles: readonly StoredProfile[]
}

type LinkInDependencies = {
  readonly teams: TeamService["Service"]
  readonly stdio: Stdio.Stdio
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
  readonly viewer: Result.Result<Viewer, LinearApiError>
}

type ProfileMatch = {
  readonly profile: StoredProfile
  readonly team: Team
}

const choiceOf = Effect.fn("LinkWorkspace.choice")(function* choiceOf(
  client: LinearClient["Service"],
  profile: StoredProfile,
): Effect.fn.Return<WorkspaceChoice> {
  const viewer = yield* Effect.result(client.viewerWithKey(profile.apiKey))
  return {
    name: profile.name,
    isDefault: profile.isDefault,
    apiKey: profile.apiKey,
    viewer,
  }
})

const formatWorkspace = (choice: WorkspaceChoice): string => {
  const marker = choice.isDefault ? "* " : ""
  const viewer = choice.viewer
  return Result.isSuccess(viewer)
    ? `${marker}${choice.name}  ${viewer.success.name} <${viewer.success.email}>  ${viewer.success.organization.name}`
    : `${marker}${choice.name}  ! ${viewer.failure.message}`
}

const promptForWorkspace = Effect.fn("LinkWorkspace.promptForWorkspace")(
  function* promptForWorkspace(choices: readonly WorkspaceChoice[]) {
    return yield* runPrompt(
      Prompt.Select({
        message: "Select a workspace",
        choices: choices.map((choice) => ({
          title: formatWorkspace(choice),
          value: choice,
          selected: choice.isDefault,
          disabled: Result.isFailure(choice.viewer),
        })),
      }),
    )
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

const linkIn = Effect.fn("LinkWorkspace.linkIn")(function* linkIn(
  apiKey: Redacted.Redacted,
  workspace: Option.Option<string>,
  options: LinkTargetOptions,
  deps: LinkInDependencies,
) {
  const link = yield* resolveLinkTeam(options, {
    teams: deps.teams.withKey(apiKey),
    stdio: deps.stdio,
  })
  return { ...link, workspace, apiKey }
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
        message: `No workspace named "${name}" in the stored profiles. Run \`rata workspace list\` to see the profiles.`,
      })
    }
    return yield* linkIn(profile.apiKey, Option.some(name), options, deps)
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
    return yield* linkIn(resolved.key, resolved.profile, options, deps)
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
  | TeamUpdateError,
  FileSystem.FileSystem | Path.Path | Terminal.Terminal
> {
  const envKey = yield* deps.auth.envKey

  if (Option.isSome(options.workspace)) {
    const profiles = yield* deps.auth.profiles
    return yield* resolveExplicitWorkspace(options.workspace.value, options, {
      ...deps,
      profiles,
    })
  }

  if (Option.isSome(envKey)) {
    return yield* linkIn(envKey.value, Option.none(), options, deps)
  }

  const profiles = yield* deps.auth.profiles
  const target: ResolvedTargetDependencies = { ...deps, profiles }

  if (profiles.length > 0 && Option.isSome(options.team)) {
    return yield* resolveAcrossProfiles(options.team.value, options, target)
  }

  if (profiles.length > 0) {
    const isTerminal = yield* deps.stdio.stdinIsTerminal
    if (isTerminal) {
      const choices = yield* Effect.forEach(profiles, (profile) => choiceOf(deps.client, profile))
      const choice = yield* promptForWorkspace(choices)
      return yield* linkIn(choice.apiKey, Option.some(choice.name), options, target)
    }
  }

  const resolved = yield* deps.auth.require
  return yield* linkIn(resolved.key, resolved.profile, options, target)
})

export { resolveLinkTarget }
