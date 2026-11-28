import { Effect, Option } from "effect"

import type { TeamNotFoundError, TeamOperations } from "@/api/team"
import type { RepoConfigService } from "@/config/repo"
import type { RepoConfig } from "@/config/repo/model"
import type { Team } from "@/linear/decode/team"
import type { LinearApiError } from "@/linear/errors"

import { currentDirectory } from "@/config/repo"
import { isUuid, teamId as asTeamId } from "@/domain/id"

type LinkedTeam = {
  readonly config: RepoConfig
  readonly team: Team
}

type LinkedTeamResult =
  | { readonly kind: "unlinked" }
  | { readonly kind: "linked"; readonly linked: LinkedTeam }
  | { readonly kind: "missing"; readonly stored: string; readonly isId: boolean }

type RepairedLink = {
  readonly config: RepoConfig
  readonly warning: string | null
}

const missingWarning = (stored: string, isId = false): string =>
  `The stored team ${isId ? "id" : "key"} ${stored} no longer exists. Run \`rata admin team list\` to see the team keys, then run \`rata admin link --team <key>\` to repair the link.`

const staleIdWarning = (storedId: string, currentKey: string): string =>
  `The stored team id ${storedId} is stale. Repaired the link to ${currentKey}.`

const staleKeyWarning = (storedKey: string, currentKey: string): string =>
  `The stored team key ${storedKey} is stale. Repaired the link to ${currentKey}.`

const repairedLink = (config: RepoConfig, team: Team): RepairedLink => {
  const storedId =
    config.teamId ?? (config.team !== undefined && isUuid(config.team) ? config.team : undefined)
  const warning =
    storedId !== undefined && storedId !== team.id
      ? staleIdWarning(storedId, team.key)
      : config.team !== undefined && !isUuid(config.team) && config.team !== team.key
        ? staleKeyWarning(config.team, team.key)
        : null
  if (config.teamId === team.id && config.team === team.key) {
    return { config, warning }
  }
  return { config: { ...config, team: team.key, teamId: team.id }, warning }
}

const optionalTeam = (
  lookup: Effect.Effect<Team, LinearApiError | TeamNotFoundError>,
): Effect.Effect<Option.Option<Team>, LinearApiError> =>
  lookup.pipe(
    Effect.asSome,
    Effect.catchTag("TeamNotFoundError", () => Effect.succeedNone),
  )

const resolveLinkedTeam = (
  config: RepoConfig | undefined,
  teams: TeamOperations,
): Effect.Effect<LinkedTeamResult, LinearApiError> =>
  Effect.gen(function* resolveTeamLink() {
    if (config === undefined) {
      return { kind: "unlinked" } as const
    }
    const stored = config.teamId ?? config.team
    if (stored === undefined) {
      return { kind: "unlinked" } as const
    }
    const ids = [
      ...(config.teamId === undefined ? [] : [config.teamId]),
      ...(config.team !== undefined && isUuid(config.team) && config.team !== config.teamId
        ? [asTeamId(config.team)]
        : []),
    ]
    for (const id of ids) {
      const found = yield* optionalTeam(teams.byId(id))
      if (Option.isSome(found)) {
        return { kind: "linked", linked: { config, team: found.value } } as const
      }
    }
    if (config.team !== undefined && !isUuid(config.team)) {
      const byKey = yield* optionalTeam(teams.byKey(config.team))
      if (Option.isSome(byKey)) {
        return { kind: "linked", linked: { config, team: byKey.value } } as const
      }
    }
    if (config.team !== undefined) {
      const byName = yield* optionalTeam(teams.byName(config.team))
      if (Option.isSome(byName)) {
        return { kind: "linked", linked: { config, team: byName.value } } as const
      }
    }
    const isId = config.teamId !== undefined || (config.team !== undefined && isUuid(config.team))
    return { kind: "missing", stored, isId } as const
  })

const repairStoredLink = Effect.fn("LinkedTeam.repair")(function* repairTeamLink(
  repoConfig: RepoConfigService["Service"],
  config: RepoConfig,
  team: Team,
) {
  const repaired = repairedLink(config, team)
  if (repaired.config !== config) {
    yield* repoConfig.write(yield* currentDirectory, repaired.config)
  }
  return repaired.warning
})

export {
  type LinkedTeam,
  type LinkedTeamResult,
  missingWarning,
  repairedLink,
  repairStoredLink,
  resolveLinkedTeam,
}
