import { Clock, Context, Effect, Layer, Option, Redacted, Ref } from "effect"

import type { RepoConfig } from "@/config/repo/model"
import type { ResolvedContext } from "@/context/model"
import type {
  ContextResolveError,
  ContextResolverShape,
  LinkedTeam,
  ResolveOptions,
} from "@/context/resolve/model"
import type { TeamId } from "@/domain/id"
import type { Team } from "@/linear/decode/team"

import { TeamService } from "@/api/team"
import {
  missingWarning,
  repairStoredLink,
  repairStoredTeamId,
  resolveLinkedTeam,
} from "@/api/team/link"
import { Auth } from "@/config/auth"
import { RepoConfigService } from "@/config/repo"
import { RepositoryIdentity } from "@/config/repo-identity"
import { hashApiKey } from "@/context/key-hash"
import { profileKey, resolveKey } from "@/context/memo-key"
import { teamAge } from "@/context/model"
import { makeContextSources } from "@/context/resolve/sources"
import { requireTeamError } from "@/context/team-error"
import { isUuid } from "@/domain/id"
import { issueDefaults } from "@/domain/issue-defaults"
import { LinearGateway } from "@/linear/gateway"
import { ContextCache } from "@/local/context-cache"

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

      const { loadConfig, loadViewerFor, locateRoot } = makeContextSources({
        identity,
        loadViewer,
        repoConfig,
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
              identity: {
                id: cached.value.detail.id,
                key: cached.value.detail.key,
                name: cached.value.detail.name,
                timezone: cached.value.detail.timezone,
              },
              detail: cached.value.detail,
              ageSeconds: teamAge(cached.value.fetchedAt, now),
              fetchedAt: cached.value.fetchedAt,
            }
          }
        }
        const resolved = team ?? (yield* teams.byId(teamId))
        const detail = yield* gateway.team.details(resolved)
        yield* cache.writeTeam(profile, teamId, keyHash, detail, now)
        return {
          identity: resolved,
          detail,
          ageSeconds: 0,
          fetchedAt: now,
        }
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
        ): Effect.fn.Return<LinkedTeam, ContextResolveError> {
          if (config === undefined || (config.team === undefined && config.teamId === undefined)) {
            return { missing: false, team: null, warning: null }
          }
          const storedId =
            config.teamId ??
            (config.team !== undefined && isUuid(config.team) ? config.team : undefined)
          if (!refresh && storedId !== undefined) {
            const cached = yield* cache.readTeam(profile, storedId, keyHash, now)
            if (Option.isSome(cached)) {
              const warning = yield* repairStoredTeamId(repoConfig, config, cached.value.detail)
              return {
                missing: false,
                team: {
                  identity: cached.value.detail,
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
            return { missing: false, team: null, warning: null }
          }
          if (linked.kind === "missing") {
            return {
              missing: true,
              team: null,
              warning: missingWarning(linked.stored, linked.isId),
            }
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
            return {
              missing: true,
              team: null,
              warning: missingWarning(linked.linked.team.key),
            }
          }
          const warning = yield* repairStoredLink(repoConfig, config, loaded.detail)
          return { missing: false, team: loaded, warning }
        },
      )

      const resolveContextTeam = Effect.fn("ContextResolver.resolveContextTeam")(
        function* resolveContextTeam(
          options: ResolveOptions,
          config: RepoConfig | undefined,
          profile: string,
          keyHash: string,
          now: number,
        ) {
          if (options.withTeam === false) {
            return { missing: false, team: null, warning: null }
          }
          if (options.teamId !== undefined) {
            return {
              missing: false,
              team: yield* loadDetail(
                options.teamId,
                null,
                profile,
                keyHash,
                options.refresh === true,
                now,
              ),
              warning: null,
            }
          }
          if (options.team === undefined) {
            return yield* resolveLinked(config, profile, keyHash, options.refresh === true, now)
          }
          return {
            missing: false,
            team: yield* loadTeamByRef(
              options.team,
              profile,
              keyHash,
              options.refresh === true,
              now,
            ),
            warning: null,
          }
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
        const withTeam = options.withTeam !== false
        const config = Option.getOrUndefined(yield* loadConfig(withTeam))
        const viewer = yield* loadViewerFor(options, profileKey(profile), keyHash, now)
        const resolvedTeam = yield* resolveContextTeam(
          options,
          config,
          profileKey(profile),
          keyHash,
          now,
        )
        if (options.requireTeam === true && resolvedTeam.team === null) {
          return yield* requireTeamError(
            resolvedTeam.missing,
            config?.team ?? config?.teamId ?? null,
          )
        }
        const detail = resolvedTeam.team?.detail ?? null
        return {
          root,
          profile,
          keySource: resolvedAuth.keySource,
          viewer,
          team: resolvedTeam.team,
          states: detail?.states ?? [],
          labels: detail?.labels ?? [],
          defaults: issueDefaults(config),
          project: config?.project ?? null,
          storedTeam: config?.team ?? config?.teamId ?? null,
          teamMissing: resolvedTeam.missing,
          warning: resolvedTeam.warning,
        }
      })

      const viewer = Effect.fn("ContextResolver.viewer")(function* resolveViewer(
        context: ResolvedContext,
      ) {
        if (context.viewer !== null) {
          return context.viewer
        }
        const resolvedAuth = yield* auth.require
        const now = yield* Clock.currentTimeMillis
        const profile = Option.getOrNull(resolvedAuth.profile)
        const keyHash = hashApiKey(Redacted.value(resolvedAuth.key))
        return yield* loadViewer(profileKey(profile), keyHash, false, now)
      })

      const resolve = Effect.fn("ContextResolver.resolve")(function* resolveContext(
        options: ResolveOptions = {},
      ) {
        const key = resolveKey(options)
        const cached = (yield* Ref.get(memo)).get(key)
        if (options.refresh !== true && cached !== undefined) {
          if (options.requireTeam === true && cached.team === null) {
            return yield* requireTeamError(cached.teamMissing, cached.storedTeam)
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

      return ContextResolver.of({ resolve, viewer })
    }),
  )
}

export { ContextResolver }
