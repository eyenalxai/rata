import { Clock, Context, Effect, Layer, Option, Redacted } from "effect"

import type { Team } from "@/api/team"
import type { TeamContextShape } from "@/context/team/model"
import type { TeamId } from "@/domain/id"

import { LinearClient } from "@/api/client"
import { TeamResolutionError, TeamService } from "@/api/team"
import { fetchTeamDetail } from "@/api/team/details"
import { missingWarning, repairStoredLink, resolveLinkedTeam } from "@/api/team/link"
import { Auth } from "@/config/auth"
import { currentDirectory, RepoConfigService } from "@/config/repo"
import { hashApiKey } from "@/context/key-hash"
import {
  ContextLabelNotFoundError,
  ContextStateNotFoundError,
  findStateByName,
  teamAge,
  validNameText,
} from "@/context/team/model"
import { isUuid, teamId as asTeamId } from "@/domain/id"
import { findLabelByName } from "@/domain/label"
import { ContextCache } from "@/local/context-cache"

class TeamContext extends Context.Service<TeamContext, TeamContextShape>()(
  "rata-cli/context/team/TeamContext",
) {
  static readonly layer = Layer.effect(
    TeamContext,
    Effect.gen(function* teamContextLayer() {
      const auth = yield* Auth
      const client = yield* LinearClient
      const teams = yield* TeamService
      const repoConfig = yield* RepoConfigService
      const cache = yield* ContextCache

      const loadViewer = Effect.fn("TeamContext.loadViewer")(function* loadViewer(
        profile: string,
        keyHash: string,
        refresh: boolean,
        now: number,
      ) {
        if (!refresh) {
          const cached = yield* cache.readViewer(profile, keyHash, now)
          if (Option.isSome(cached)) {
            return cached.value.viewer
          }
        }
        const viewer = yield* client.viewer
        yield* cache.writeViewer(profile, keyHash, viewer, now)
        return viewer
      })

      const loadDetail = Effect.fn("TeamContext.loadDetail")(function* loadTeamDetail(
        teamId: TeamId,
        identity: Team | null,
        profile: string,
        keyHash: string,
        refresh: boolean,
        now: number,
      ) {
        if (!refresh) {
          const cached = yield* cache.readTeam(profile, teamId, keyHash, now)
          if (Option.isSome(cached)) {
            return {
              detail: cached.value.detail,
              ageSeconds: teamAge(cached.value.fetchedAt, now),
              fetchedAt: cached.value.fetchedAt,
            }
          }
        }
        const resolved = identity ?? (yield* teams.byId(teamId))
        const detail = yield* fetchTeamDetail(client.execute, resolved)
        yield* cache.writeTeam(profile, teamId, keyHash, detail, now)
        return { detail, ageSeconds: 0, fetchedAt: now }
      })

      const resolve = Effect.fn("TeamContext.resolve")(function* resolveTeamContext(options: {
        readonly refresh: boolean
      }) {
        const resolvedAuth = yield* auth.require
        const now = yield* Clock.currentTimeMillis
        const profile = Option.getOrElse(resolvedAuth.profile, () => "env")
        const keyHash = hashApiKey(Redacted.value(resolvedAuth.key))
        const config = Option.getOrUndefined(yield* repoConfig.read(yield* currentDirectory))
        const viewer = yield* loadViewer(profile, keyHash, options.refresh, now)
        if (config === undefined || (config.team === undefined && config.teamId === undefined)) {
          return { team: null, viewer, warning: null }
        }
        const storedId =
          config.teamId ??
          (config.team !== undefined && isUuid(config.team) ? asTeamId(config.team) : undefined)
        if (!options.refresh && storedId !== undefined) {
          const cached = yield* cache.readTeam(profile, storedId, keyHash, now)
          if (Option.isSome(cached)) {
            const warning = yield* repairStoredLink(repoConfig, config, cached.value.detail)
            return {
              team: {
                detail: cached.value.detail,
                ageSeconds: teamAge(cached.value.fetchedAt, now),
                fetchedAt: cached.value.fetchedAt,
              },
              viewer,
              warning,
            }
          }
        }
        const linked = yield* resolveLinkedTeam(config, teams)
        if (linked.kind === "unlinked") {
          return { team: null, viewer, warning: null }
        }
        if (linked.kind === "missing") {
          return { team: null, viewer, warning: missingWarning(linked.stored, linked.isId) }
        }
        const loaded = yield* loadDetail(
          linked.linked.team.id,
          linked.linked.team,
          profile,
          keyHash,
          true,
          now,
        ).pipe(Effect.catchTag("TeamNotFoundError", () => Effect.succeed(null)))
        if (loaded === null) {
          return { team: null, viewer, warning: missingWarning(linked.linked.team.key) }
        }
        const warning = yield* repairStoredLink(repoConfig, config, loaded.detail)
        return { team: loaded, viewer, warning }
      })

      const loadDetailFor = Effect.fn("TeamContext.loadDetailFor")(function* loadDetailForTeam(
        teamId: TeamId,
        refresh: boolean,
      ) {
        const resolvedAuth = yield* auth.require
        const now = yield* Clock.currentTimeMillis
        const profile = Option.getOrElse(resolvedAuth.profile, () => "env")
        const keyHash = hashApiKey(Redacted.value(resolvedAuth.key))
        return yield* loadDetail(teamId, null, profile, keyHash, refresh, now)
      })

      const requireTeam = Effect.fn("TeamContext.requireTeam")(function* requireLinkedTeam(
        refresh: boolean,
      ) {
        const resolved = yield* resolve({ refresh })
        if (resolved.team === null) {
          return yield* new TeamResolutionError({
            message: "No team. Run `rata link` to link this repository.",
          })
        }
        return resolved.team
      })

      const resolveState = Effect.fn("TeamContext.resolveState")(function* findState(
        name: string,
        teamId?: TeamId,
      ) {
        if (teamId !== undefined) {
          const first = yield* loadDetailFor(teamId, false)
          const found = findStateByName(first.detail.states, name)
          if (found !== undefined) {
            return found
          }
          const refreshed = yield* loadDetailFor(teamId, true)
          const afterRefresh = findStateByName(refreshed.detail.states, name)
          if (afterRefresh !== undefined) {
            return afterRefresh
          }
          const valid = refreshed.detail.states.map((state) => state.name)
          return yield* new ContextStateNotFoundError({
            value: name,
            teamId: refreshed.detail.id,
            valid,
            message: `No workflow state named ${name} in team ${refreshed.detail.key}. ${validNameText("states", valid)}`,
          })
        }
        const team = yield* requireTeam(false)
        const found = findStateByName(team.detail.states, name)
        if (found !== undefined) {
          return found
        }
        const refreshed = yield* requireTeam(true)
        const afterRefresh = findStateByName(refreshed.detail.states, name)
        if (afterRefresh !== undefined) {
          return afterRefresh
        }
        const valid = refreshed.detail.states.map((state) => state.name)
        return yield* new ContextStateNotFoundError({
          value: name,
          teamId: refreshed.detail.id,
          valid,
          message: `No workflow state named ${name} in team ${refreshed.detail.key}. ${validNameText("states", valid)}`,
        })
      })

      const resolveLabel = Effect.fn("TeamContext.resolveLabel")(function* findLabel(
        name: string,
        teamId?: TeamId,
      ) {
        if (teamId !== undefined) {
          const first = yield* loadDetailFor(teamId, false)
          const found = findLabelByName(first.detail.labels, name)
          if (found !== undefined) {
            return found
          }
          const refreshed = yield* loadDetailFor(teamId, true)
          const afterRefresh = findLabelByName(refreshed.detail.labels, name)
          if (afterRefresh !== undefined) {
            return afterRefresh
          }
          const valid = refreshed.detail.labels.map((label) => label.name)
          return yield* new ContextLabelNotFoundError({
            value: name,
            teamId: refreshed.detail.id,
            valid,
            message: `No label named ${name} in team ${refreshed.detail.key}. ${validNameText("labels", valid)}`,
          })
        }
        const team = yield* requireTeam(false)
        const found = findLabelByName(team.detail.labels, name)
        if (found !== undefined) {
          return found
        }
        const refreshed = yield* requireTeam(true)
        const afterRefresh = findLabelByName(refreshed.detail.labels, name)
        if (afterRefresh !== undefined) {
          return afterRefresh
        }
        const valid = refreshed.detail.labels.map((label) => label.name)
        return yield* new ContextLabelNotFoundError({
          value: name,
          teamId: refreshed.detail.id,
          valid,
          message: `No label named ${name} in team ${refreshed.detail.key}. ${validNameText("labels", valid)}`,
        })
      })

      return TeamContext.of({ resolve, resolveLabel, resolveState })
    }),
  )
}

export { TeamContext }
