import type { FileSystem, Path, Stdio, Terminal } from "effect"

import { Effect, Option, Redacted, Result } from "effect"
import { Prompt } from "effect/cli"

import type { TeamCreateError, TeamService } from "@/api/team"
import type { Auth, StoredProfile } from "@/config/auth"
import type { AuthStoreError } from "@/config/auth/error"
import type { LinkTargetOptions } from "@/config/link/team"
import type { DatabaseError } from "@/db/database"
import type { Team } from "@/linear/decode/team"
import type { Viewer } from "@/linear/decode/viewer"
import type { LinearApiError } from "@/linear/errors"
import type { LinearGatewayShape } from "@/linear/gateway"

import { TeamNotFoundError } from "@/api/team"
import { LinkError, resolveLinkTeam } from "@/config/link/team"
import { runPrompt } from "@/config/prompt"

type LinkTargetDependencies = {
  readonly auth: Auth["Service"]
  readonly gateway: LinearGatewayShape
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
  gateway: LinearGatewayShape,
  profile: StoredProfile,
): Effect.fn.Return<WorkspaceChoice> {
  const viewer = yield* Effect.result(gateway.viewerWithKey(profile.apiKey))
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
  const team = yield* resolveLinkTeam(options, {
    teams: deps.teams.withKey(apiKey),
    stdio: deps.stdio,
  })
  return { team, workspace, apiKey }
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
        message: `No workspace named "${name}" in the stored profiles. Run \`rata admin workspace list\` to see the profiles.`,
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
      return {
        team: match.team,
        workspace: Option.some(match.profile.name),
        apiKey: match.profile.apiKey,
      }
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
  AuthStoreError | DatabaseError | LinkError | LinearApiError | TeamCreateError | TeamNotFoundError,
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
      const choices = yield* Effect.forEach(profiles, (profile) => choiceOf(deps.gateway, profile))
      const choice = yield* promptForWorkspace(choices)
      return yield* linkIn(choice.apiKey, Option.some(choice.name), options, target)
    }
  }

  const resolved = yield* deps.auth.require
  return yield* linkIn(resolved.key, resolved.profile, options, target)
})

export { resolveLinkTarget }
