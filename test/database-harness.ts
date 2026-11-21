import { SqliteClient } from "@effect/sql-sqlite-bun"
import { makeWithDefaults } from "drizzle-orm/effect-sqlite-bun"
import { migrate } from "drizzle-orm/effect-sqlite-bun/migrator"
import { Effect, Layer } from "effect"
import path from "node:path"

import type { Viewer } from "@/api/client"
import type { TeamDetail } from "@/api/team/details"

import { Database } from "@/db/database"
import { contextCache, profiles, repositories, viewerCache } from "@/db/schema"

type RepositorySeed = {
  readonly key: string
  readonly team?: string | undefined
  readonly teamId?: string | undefined
  readonly project?: string | undefined
  readonly workspace?: string | undefined
  readonly defaultAssignee?: string | undefined
  readonly defaultLabels?: readonly string[] | undefined
  readonly defaultPriority?: number | undefined
}

type ProfileSeed = {
  readonly name: string
  readonly apiKey: string
  readonly isDefault?: boolean | undefined
}

type ContextCacheSeed = {
  readonly profile: string
  readonly teamId: string
  readonly keyHash: string
  readonly detail: TeamDetail
  readonly fetchedAt: number
}

type ViewerCacheSeed = {
  readonly profile: string
  readonly keyHash: string
  readonly viewer: Viewer
  readonly fetchedAt: number
}

type CacheSeed = {
  readonly teams?: readonly ContextCacheSeed[] | undefined
  readonly viewers?: readonly ViewerCacheSeed[] | undefined
}

const migrationsFolder = path.resolve(import.meta.dir, "../drizzle")

const databaseLayer = (
  seed: readonly RepositorySeed[] = [],
  profileSeed: readonly ProfileSeed[] = [],
  cacheSeed: CacheSeed = {},
) =>
  Layer.effect(
    Database,
    Effect.gen(function* openTestDatabase() {
      const drizzle = yield* makeWithDefaults()
      yield* migrate(drizzle, { migrationsFolder })
      yield* Effect.forEach(seed, (row) =>
        drizzle
          .insert(repositories)
          .values({
            key: row.key,
            team: row.team ?? null,
            teamId: row.teamId ?? null,
            project: row.project ?? null,
            workspace: row.workspace ?? null,
            defaultAssignee: row.defaultAssignee ?? null,
            defaultLabels:
              row.defaultLabels === undefined || row.defaultLabels.length === 0
                ? null
                : JSON.stringify(row.defaultLabels),
            defaultPriority: row.defaultPriority ?? null,
          })
          .run(),
      )
      yield* Effect.forEach(profileSeed, (profile) =>
        drizzle
          .insert(profiles)
          .values({
            name: profile.name,
            apiKey: profile.apiKey,
            isDefault: profile.isDefault === true ? 1 : 0,
          })
          .run(),
      )
      yield* Effect.forEach(cacheSeed.teams ?? [], (row) =>
        drizzle
          .insert(contextCache)
          .values({
            profile: row.profile,
            teamId: row.teamId,
            keyHash: row.keyHash,
            detail: JSON.stringify(row.detail),
            fetchedAt: row.fetchedAt,
          })
          .run(),
      )
      yield* Effect.forEach(cacheSeed.viewers ?? [], (row) =>
        drizzle
          .insert(viewerCache)
          .values({
            profile: row.profile,
            keyHash: row.keyHash,
            viewer: JSON.stringify(row.viewer),
            fetchedAt: row.fetchedAt,
          })
          .run(),
      )
      return Database.of({ drizzle, file: ":memory:" })
    }),
  ).pipe(Layer.provide(SqliteClient.layer({ filename: ":memory:" })), Layer.orDie)

export {
  type CacheSeed,
  databaseLayer,
  type ProfileSeed,
  type RepositorySeed,
  type ContextCacheSeed,
  type ViewerCacheSeed,
}
