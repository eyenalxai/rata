import { Console, Context, Effect, Layer, Option } from "effect"

import type { LinearApiError } from "@/api/errors"
import type { Team } from "@/api/team"
import type { RepoConfig, RepoConfigError } from "@/config/repo"

import { TeamNotFoundError, TeamResolutionError, TeamService } from "@/api/team"
import { currentDirectory, RepoConfigService } from "@/config/repo"
import { isUuid } from "@/domain/ref"

type ResolvedRepoTeam = {
  readonly team: Team
  readonly warning: string | null
}

type RepoTeamError = LinearApiError | RepoConfigError | TeamNotFoundError | TeamResolutionError

type RepoTeamShape = {
  readonly linkedTeam: Effect.Effect<Option.Option<ResolvedRepoTeam>, RepoTeamError>
  readonly resolve: (flag?: string) => Effect.Effect<string, RepoTeamError>
}

const foundOrNull = (lookup: Effect.Effect<Team, LinearApiError | TeamNotFoundError>) =>
  lookup.pipe(
    Effect.map((team): Team | null => team),
    Effect.catchTag("TeamNotFoundError", () => Effect.succeed(null)),
  )

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
          return value
        }
        const team = yield* teams.byKey(value)
        return team.id
      })

      const repair = Effect.fn("RepoTeam.repair")(function* repairLink(
        config: RepoConfig,
        team: Team,
        warning: string | null,
      ) {
        const directory = yield* currentDirectory
        yield* repoConfig.write(directory, { ...config, team: team.key, teamId: team.id })
        return { team, warning }
      })

      const findStoredTeam = Effect.fn("RepoTeam.findStoredTeam")(function* findStoredTeam(
        config: RepoConfig,
      ) {
        const stored = config.team ?? config.teamId
        if (stored === undefined) {
          return yield* new TeamResolutionError({ message: "No team. Run `rata link`." })
        }
        if (config.teamId !== undefined) {
          const byId = yield* foundOrNull(teams.byId(config.teamId))
          if (byId !== null) {
            if (config.team === undefined) {
              return yield* repair(config, byId, null)
            }
            if (config.team === byId.key) {
              return { team: byId, warning: null }
            }
            return yield* repair(
              config,
              byId,
              `The stored team key ${config.team} is stale. Repaired the link to ${byId.key}.`,
            )
          }
        }
        const byKey = yield* foundOrNull(teams.byKey(stored))
        if (byKey !== null) {
          if (config.teamId === undefined && config.team === byKey.key) {
            return yield* repair(config, byKey, null)
          }
          return yield* repair(
            config,
            byKey,
            `The stored team key ${stored} is stale. Repaired the link to ${byKey.key}.`,
          )
        }
        const byName = yield* foundOrNull(teams.byName(stored))
        if (byName !== null) {
          return yield* repair(
            config,
            byName,
            `The stored team key ${stored} is stale. Repaired the link to ${byName.key}.`,
          )
        }
        return yield* new TeamNotFoundError({
          key: stored,
          message: `No team with key ${stored}.`,
        })
      })

      const linkedTeam = Effect.gen(function* linkedTeam() {
        const config = Option.getOrUndefined(yield* repoConfig.read(yield* currentDirectory))
        if (config === undefined || (config.team === undefined && config.teamId === undefined)) {
          return Option.none<ResolvedRepoTeam>()
        }
        return Option.some(yield* findStoredTeam(config))
      }).pipe(Effect.withSpan("RepoTeam.linkedTeam"))

      const resolve = Effect.fn("RepoTeam.resolve")(function* resolve(flag?: string) {
        if (flag !== undefined) {
          return yield* teamIdFor(flag)
        }
        const config = Option.getOrUndefined(yield* repoConfig.read(yield* currentDirectory))
        if (config?.teamId === undefined && config?.team !== undefined && isUuid(config.team)) {
          return config.team
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
