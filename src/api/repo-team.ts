import { Console, Context, Effect, Layer, Option } from "effect"

import type { LinearApiError } from "@/api/errors"
import type { Team } from "@/api/team"
import type { RepoConfigError } from "@/config/repo"
import type { TeamId } from "@/domain/id"

import { TeamNotFoundError, TeamResolutionError, TeamService } from "@/api/team"
import { repairStoredLink, resolveLinkedTeam } from "@/api/team/link"
import { currentDirectory, RepoConfigService } from "@/config/repo"
import { isUuid, teamId } from "@/domain/id"

type ResolvedRepoTeam = {
  readonly team: Team
  readonly warning: string | null
}

type RepoTeamError = LinearApiError | RepoConfigError | TeamNotFoundError | TeamResolutionError

type RepoTeamShape = {
  readonly linkedTeam: Effect.Effect<Option.Option<ResolvedRepoTeam>, RepoTeamError>
  readonly resolve: (flag?: string) => Effect.Effect<TeamId, RepoTeamError>
}

class RepoTeam extends Context.Service<RepoTeam, RepoTeamShape>()(
  "rata-cli/api/repo-team/RepoTeam",
) {
  static readonly layer = Layer.effect(
    RepoTeam,
    Effect.gen(function* repoTeamLayer() {
      const teams = yield* TeamService
      const repoConfig = yield* RepoConfigService

      const teamIdFor = Effect.fn("RepoTeam.teamIdFor")(function* teamIdFor(value: string) {
        if (isUuid(value)) {
          return teamId(value)
        }
        const team = yield* teams.byKey(value)
        return team.id
      })

      const linkedTeam = Effect.gen(function* linkedTeam() {
        const config = Option.getOrUndefined(yield* repoConfig.read(yield* currentDirectory))
        if (config === undefined || (config.team === undefined && config.teamId === undefined)) {
          return Option.none<ResolvedRepoTeam>()
        }
        const resolved = yield* resolveLinkedTeam(config, teams)
        if (resolved.kind === "unlinked") {
          return Option.none<ResolvedRepoTeam>()
        }
        if (resolved.kind === "missing") {
          return yield* new TeamNotFoundError({
            key: resolved.stored,
            message: `No team with ${resolved.isId ? "id" : "key"} ${resolved.stored}.`,
          })
        }
        const warning = yield* repairStoredLink(repoConfig, config, resolved.linked.team)
        return Option.some({ team: resolved.linked.team, warning })
      }).pipe(Effect.withSpan("RepoTeam.linkedTeam"))

      const resolve = Effect.fn("RepoTeam.resolve")(function* resolve(flag?: string) {
        if (flag !== undefined) {
          return yield* teamIdFor(flag)
        }
        const config = Option.getOrUndefined(yield* repoConfig.read(yield* currentDirectory))
        if (config?.teamId === undefined && config?.team !== undefined && isUuid(config.team)) {
          return teamId(config.team)
        }
        const linked = yield* linkedTeam
        if (Option.isNone(linked)) {
          return yield* new TeamResolutionError({
            message: "No team. Pass --team, or run `rata link`.",
          })
        }
        if (linked.value.warning !== null) {
          yield* Console.error(`warning: ${linked.value.warning}`)
        }
        return linked.value.team.id
      })

      return RepoTeam.of({ linkedTeam, resolve })
    }),
  )
}

export { RepoTeam, type ResolvedRepoTeam }
