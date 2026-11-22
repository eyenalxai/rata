import { Clock, Context, Effect, Layer, Option, Redacted, Ref } from "effect"

import type { TeamNotFoundError } from "@/api/team"
import type { AuthStoreError } from "@/config/auth/error"
import type { RepoConfig } from "@/config/repo/model"
import type { ContextTeam, ResolvedContext, TeamDetailSnapshot } from "@/context/model"
import type { DatabaseError } from "@/db/database"
import type { TeamId } from "@/domain/id"
import type { Team } from "@/linear/decode/team"
import type { LinearApiError } from "@/linear/errors"
import type { ContextCacheError } from "@/local/context-cache"

import { TeamResolutionError, TeamService } from "@/api/team"
import { missingWarning, repairStoredLink, resolveLinkedTeam } from "@/api/team/link"
import { Auth } from "@/config/auth"
import { currentDirectory, RepoConfigError, RepoConfigService } from "@/config/repo"
import { RepositoryIdentity } from "@/config/repo-identity"
import { hashApiKey } from "@/context/key-hash"
import { teamAge } from "@/context/model"
import { isUuid, teamId as asTeamId } from "@/domain/id"
import { issueDefaults } from "@/domain/issue-defaults"
import { LinearGateway } from "@/linear/gateway"
import { ContextCache } from "@/local/context-cache"

type ContextResolveError =
  | AuthStoreError
  | ContextCacheError
  | DatabaseError
  | LinearApiError
  | RepoConfigError
  | TeamNotFoundError
  | TeamResolutionError

type ResolveOptions = {
  readonly refresh?: boolean | undefined
  readonly team?: string | undefined
  readonly requireTeam?: boolean | undefined
}

type ContextResolverShape = {
  readonly resolve: (
    options?: ResolveOptions,
  ) => Effect.Effect<ResolvedContext, ContextResolveError>
  readonly teamDetail: (
    teamId: TeamId,
    refresh: boolean,
  ) => Effect.Effect<TeamDetailSnapshot, ContextResolveError>
}

const profileKey = (profile: string | null): string => profile ?? "env"

class ContextResolver extends Context.Service<ContextResolver, ContextResolverShape>()(
  "rata-cli/context/resolve/ContextResolver",
) {
  static readonly layer = Layer.effect(
    ContextResolver,
    Effect.gen(function* contextResolverLayer() {
      const auth = yield* Auth
      const gateway = yield* LinearGateway
      const teams = yield* TeamService
      const repoConfig = yield* RepoConfigService
      const identity = yield* RepositoryIdentity
      const cache = yield* ContextCache
      const memo = yield* Ref.make<ReadonlyMap<string, ResolvedContext>>(new Map())

      const loadViewer = Effect.fn("ContextResolver.loadViewer")(function* loadContextViewer(
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
        const viewer = yield* gateway.viewer
        yield* cache.writeViewer(profile, keyHash, viewer, now)
        return viewer
      })

      const loadDetail = Effect.fn("ContextResolver.loadDetail")(function* loadTeamDetail(
        teamId: TeamId,
        team: Team | null,
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
        const resolved = team ?? (yield* teams.byId(teamId))
        const detail = yield* gateway.team.details(resolved)
        yield* cache.writeTeam(profile, teamId, keyHash, detail, now)
        return { detail, ageSeconds: 0, fetchedAt: now }
      })

      const locateRoot = Effect.fn("ContextResolver.locateRoot")(function* locateRepositoryRoot() {
        const location = yield* identity
          .locate(yield* currentDirectory)
          .pipe(
            Effect.mapError(
              (error) => new RepoConfigError({ message: error.message, cause: error }),
            ),
          )
        return location.root
      })

      const loadTeamByRef = Effect.fn("ContextResolver.loadTeamByRef")(
        function* loadTeamByReference(
          ref: string,
          profile: string,
          keyHash: string,
          refresh: boolean,
          now: number,
        ) {
          const team = yield* teams.byKey(ref)
          return yield* loadDetail(team.id, team, profile, keyHash, refresh, now)
        },
      )

      const resolveLinked = Effect.fn("ContextResolver.resolveLinked")(
        function* resolveLinkedTeamContext(
          config: RepoConfig | undefined,
          profile: string,
          keyHash: string,
          refresh: boolean,
          now: number,
        ): Effect.fn.Return<
          { readonly team: TeamDetailSnapshot | null; readonly warning: string | null },
          ContextResolveError
        > {
          if (config === undefined || (config.team === undefined && config.teamId === undefined)) {
            return { team: null, warning: null }
          }
          const storedId =
            config.teamId ??
            (config.team !== undefined && isUuid(config.team) ? asTeamId(config.team) : undefined)
          if (!refresh && storedId !== undefined) {
            const cached = yield* cache.readTeam(profile, storedId, keyHash, now)
            if (Option.isSome(cached)) {
              const warning = yield* repairStoredLink(repoConfig, config, cached.value.detail)
              return {
                team: {
                  detail: cached.value.detail,
                  ageSeconds: teamAge(cached.value.fetchedAt, now),
                  fetchedAt: cached.value.fetchedAt,
                },
                warning,
              }
            }
          }
          const linked = yield* resolveLinkedTeam(config, teams)
          if (linked.kind === "unlinked") {
            return { team: null, warning: null }
          }
          if (linked.kind === "missing") {
            return { team: null, warning: missingWarning(linked.stored, linked.isId) }
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
            return { team: null, warning: missingWarning(linked.linked.team.key) }
          }
          const warning = yield* repairStoredLink(repoConfig, config, loaded.detail)
          return { team: loaded, warning }
        },
      )

      const buildContext = Effect.fn("ContextResolver.buildContext")(function* buildResolvedContext(
        options: ResolveOptions,
      ): Effect.fn.Return<ResolvedContext, ContextResolveError> {
        const resolvedAuth = yield* auth.require
        const now = yield* Clock.currentTimeMillis
        const profile = Option.getOrNull(resolvedAuth.profile)
        const keyHash = hashApiKey(Redacted.value(resolvedAuth.key))
        const root = yield* locateRoot()
        const config = Option.getOrUndefined(yield* repoConfig.read(yield* currentDirectory))
        const viewer = yield* loadViewer(
          profileKey(profile),
          keyHash,
          options.refresh === true,
          now,
        )
        const resolvedTeam =
          options.team === undefined
            ? yield* resolveLinked(
                config,
                profileKey(profile),
                keyHash,
                options.refresh === true,
                now,
              )
            : {
                team: yield* loadTeamByRef(
                  options.team,
                  profileKey(profile),
                  keyHash,
                  options.refresh === true,
                  now,
                ),
                warning: null,
              }
        if (options.requireTeam === true && resolvedTeam.team === null) {
          return yield* new TeamResolutionError({
            message: "No team. Pass --team, or run `rata link`.",
          })
        }
        const detail = resolvedTeam.team?.detail ?? null
        const team: ContextTeam | null =
          resolvedTeam.team === null || detail === null
            ? null
            : {
                identity: {
                  id: detail.id,
                  key: detail.key,
                  name: detail.name,
                  timezone: detail.timezone,
                },
                detail,
                ageSeconds: resolvedTeam.team.ageSeconds,
                fetchedAt: resolvedTeam.team.fetchedAt,
              }
        return {
          root,
          profile,
          keySource: resolvedAuth.keySource,
          viewer,
          team,
          states: detail?.states ?? [],
          labels: detail?.labels ?? [],
          defaults: issueDefaults(config),
          project: config?.project ?? null,
          storedTeam: config?.team ?? config?.teamId ?? null,
          storedTeamId: config?.teamId ?? null,
          warning: resolvedTeam.warning,
        }
      })

      const resolve = Effect.fn("ContextResolver.resolve")(function* resolveContext(
        options: ResolveOptions = {},
      ) {
        const key = options.team ?? ""
        const cached = (yield* Ref.get(memo)).get(key)
        if (options.refresh !== true && cached !== undefined) {
          if (options.requireTeam === true && cached.team === null) {
            return yield* new TeamResolutionError({
              message: "No team. Pass --team, or run `rata link`.",
            })
          }
          return cached
        }
        if (options.refresh === true) {
          yield* Ref.set(memo, new Map())
        }
        const context = yield* buildContext(options)
        yield* Ref.update(memo, (entries) => new Map(entries).set(key, context))
        return context
      })

      const teamDetail = Effect.fn("ContextResolver.teamDetail")(function* readTeamDetail(
        teamId: TeamId,
        refresh: boolean,
      ) {
        if (refresh) {
          yield* Ref.set(memo, new Map())
        }
        const resolvedAuth = yield* auth.require
        const now = yield* Clock.currentTimeMillis
        const profile = Option.getOrNull(resolvedAuth.profile)
        const keyHash = hashApiKey(Redacted.value(resolvedAuth.key))
        return yield* loadDetail(teamId, null, profileKey(profile), keyHash, refresh, now)
      })

      return ContextResolver.of({ resolve, teamDetail })
    }),
  )
}

export { ContextResolver, type ContextResolveError, type ContextResolverShape, type ResolveOptions }
