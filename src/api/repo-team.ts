import { Context, Effect, Layer, Option } from "effect"

import type { LinearApiError } from "@/api/errors"
import type { TeamNotFoundError } from "@/api/team"
import type { RepoConfigError } from "@/config/repo"

import { TeamResolutionError, TeamService } from "@/api/team"
import { currentDirectory, RepoConfigService } from "@/config/repo"
import { isUuid } from "@/domain/ref"

type RepoTeamShape = {
  readonly resolve: (
    flag?: string,
  ) => Effect.Effect<
    string,
    LinearApiError | RepoConfigError | TeamNotFoundError | TeamResolutionError
  >
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
          return value
        }
        const team = yield* teams.byKey(value)
        return team.id
      })

      const resolve = Effect.fn("RepoTeam.resolve")(function* resolve(flag?: string) {
        const config = Option.getOrUndefined(yield* repoConfig.read(yield* currentDirectory))
        const value = flag ?? config?.team
        if (value === undefined) {
          return yield* new TeamResolutionError({
            message: "No team. Pass --team, or run `rata link`.",
          })
        }
        return yield* teamIdFor(value)
      })

      return RepoTeam.of({ resolve })
    }),
  )
}

export { RepoTeam }
