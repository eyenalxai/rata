import { SqliteClient } from "@effect/sql-sqlite-bun"
import { makeWithDefaults } from "drizzle-orm/effect-sqlite-bun"
import { migrate } from "drizzle-orm/effect-sqlite-bun/migrator"
import { Effect, Layer } from "effect"
import path from "node:path"

import { Database } from "@/db/database"
import { profiles, repositories } from "@/db/schema"

type RepositorySeed = {
  readonly key: string
  readonly team?: string | undefined
  readonly project?: string | undefined
  readonly workspace?: string | undefined
}

type ProfileSeed = {
  readonly name: string
  readonly apiKey: string
  readonly isDefault?: boolean | undefined
}

const migrationsFolder = path.resolve(import.meta.dir, "../drizzle")

const databaseLayer = (
  seed: readonly RepositorySeed[] = [],
  profileSeed: readonly ProfileSeed[] = [],
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
            project: row.project ?? null,
            workspace: row.workspace ?? null,
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
      return Database.of({ drizzle, file: ":memory:" })
    }),
  ).pipe(Layer.provide(SqliteClient.layer({ filename: ":memory:" })), Layer.orDie)

export { databaseLayer, type ProfileSeed, type RepositorySeed }
