import { and, eq, gte } from "drizzle-orm"
import { Context, Effect, Layer, Option, Schema } from "effect"

import { Database } from "@/db/database"
import { contextCache, viewerCache } from "@/db/schema"
import { TeamDetail } from "@/linear/decode/team"
import { Viewer } from "@/linear/decode/viewer"

const contextCacheTtlMillis = 7 * 24 * 60 * 60 * 1000

const TeamDetailJson = Schema.fromJsonString(TeamDetail)
const ViewerJson = Schema.fromJsonString(Viewer)

type CachedTeamDetail = {
  readonly detail: TeamDetail
  readonly fetchedAt: number
}

type CachedViewer = {
  readonly viewer: Viewer
  readonly fetchedAt: number
}

class ContextCacheError extends Schema.TaggedError<ContextCacheError>()("ContextCacheError", {
  message: Schema.String,
  cause: Schema.optional(Schema.Defect()),
}) {}

const describeQueryFailure =
  (action: string) =>
  (cause: unknown): ContextCacheError =>
    new ContextCacheError({ message: `Could not ${action} the context cache.`, cause })

const describeEncodeFailure =
  (subject: string) =>
  (cause: unknown): ContextCacheError =>
    new ContextCacheError({ message: `Could not encode the cached ${subject}.`, cause })

const decodeTeam = (detail: string): Option.Option<TeamDetail> =>
  Schema.decodeOption(TeamDetailJson)(detail)

const decodeViewer = (viewer: string): Option.Option<Viewer> =>
  Schema.decodeOption(ViewerJson)(viewer)

type ContextCacheShape = {
  readonly readTeam: (
    profile: string,
    teamId: string,
    keyHash: string,
    now: number,
  ) => Effect.Effect<Option.Option<CachedTeamDetail>, ContextCacheError>
  readonly writeTeam: (
    profile: string,
    teamId: string,
    keyHash: string,
    detail: TeamDetail,
    fetchedAt: number,
  ) => Effect.Effect<void, ContextCacheError>
  readonly readViewer: (
    profile: string,
    keyHash: string,
    now: number,
  ) => Effect.Effect<Option.Option<CachedViewer>, ContextCacheError>
  readonly writeViewer: (
    profile: string,
    keyHash: string,
    viewer: Viewer,
    fetchedAt: number,
  ) => Effect.Effect<void, ContextCacheError>
}

class ContextCache extends Context.Service<ContextCache, ContextCacheShape>()(
  "rata-cli/local/context-cache/ContextCache",
) {
  static readonly layer = Layer.effect(
    ContextCache,
    Effect.gen(function* contextCacheLayer() {
      const database = yield* Database
      const openedDatabase = database.open.pipe(
        Effect.mapError((cause) => new ContextCacheError({ message: cause.message, cause })),
      )

      const readTeam = Effect.fn("ContextCache.readTeam")(function* readStoredTeam(
        profile: string,
        teamId: string,
        keyHash: string,
        now: number,
      ) {
        const opened = yield* openedDatabase
        const rows = yield* opened.drizzle
          .select()
          .from(contextCache)
          .where(
            and(
              eq(contextCache.profile, profile),
              eq(contextCache.teamId, teamId),
              eq(contextCache.keyHash, keyHash),
              gte(contextCache.fetchedAt, now - contextCacheTtlMillis),
            ),
          )
          .all()
          .pipe(Effect.mapError(describeQueryFailure("read")))
        const row = rows[0]
        if (row === undefined) {
          return Option.none<CachedTeamDetail>()
        }
        const detail = decodeTeam(row.detail)
        if (Option.isNone(detail)) {
          return Option.none<CachedTeamDetail>()
        }
        return Option.some({ detail: detail.value, fetchedAt: row.fetchedAt })
      })

      const writeTeam = Effect.fn("ContextCache.writeTeam")(function* writeStoredTeam(
        profile: string,
        teamId: string,
        keyHash: string,
        detail: TeamDetail,
        fetchedAt: number,
      ) {
        const encoded = yield* Schema.encodeEffect(TeamDetailJson)(detail).pipe(
          Effect.mapError(describeEncodeFailure("team")),
        )
        const columns = { keyHash, detail: encoded, fetchedAt }
        const opened = yield* openedDatabase
        yield* opened.drizzle
          .insert(contextCache)
          .values({ profile, teamId, ...columns })
          .onConflictDoUpdate({
            target: [contextCache.profile, contextCache.teamId, contextCache.keyHash],
            set: columns,
          })
          .run()
          .pipe(Effect.mapError(describeQueryFailure("write")))
      })

      const readViewer = Effect.fn("ContextCache.readViewer")(function* readStoredViewer(
        profile: string,
        keyHash: string,
        now: number,
      ) {
        const opened = yield* openedDatabase
        const rows = yield* opened.drizzle
          .select()
          .from(viewerCache)
          .where(
            and(
              eq(viewerCache.profile, profile),
              eq(viewerCache.keyHash, keyHash),
              gte(viewerCache.fetchedAt, now - contextCacheTtlMillis),
            ),
          )
          .all()
          .pipe(Effect.mapError(describeQueryFailure("read")))
        const row = rows[0]
        if (row === undefined) {
          return Option.none<CachedViewer>()
        }
        const viewer = decodeViewer(row.viewer)
        if (Option.isNone(viewer)) {
          return Option.none<CachedViewer>()
        }
        return Option.some({ viewer: viewer.value, fetchedAt: row.fetchedAt })
      })

      const writeViewer = Effect.fn("ContextCache.writeViewer")(function* writeStoredViewer(
        profile: string,
        keyHash: string,
        viewer: Viewer,
        fetchedAt: number,
      ) {
        const encoded = yield* Schema.encodeEffect(ViewerJson)(viewer).pipe(
          Effect.mapError(describeEncodeFailure("viewer")),
        )
        const opened = yield* openedDatabase
        yield* opened.drizzle
          .insert(viewerCache)
          .values({ profile, keyHash, viewer: encoded, fetchedAt })
          .onConflictDoUpdate({
            target: [viewerCache.profile, viewerCache.keyHash],
            set: { viewer: encoded, fetchedAt },
          })
          .run()
          .pipe(Effect.mapError(describeQueryFailure("write")))
      })

      return ContextCache.of({ readTeam, readViewer, writeTeam, writeViewer })
    }),
  )
}

export {
  type CachedTeamDetail,
  type CachedViewer,
  ContextCache,
  ContextCacheError,
  contextCacheTtlMillis,
}
