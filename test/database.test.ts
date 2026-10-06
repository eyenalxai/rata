import { SqliteClient } from "@effect/sql-sqlite-bun"
import { describe, expect, test } from "bun:test"
import { makeWithDefaults } from "drizzle-orm/effect-sqlite-bun"
import { migrate } from "drizzle-orm/effect-sqlite-bun/migrator"
import { Effect } from "effect"
import path from "node:path"

import { profiles, repositories } from "@/db/schema"

const migrationsFolder = path.resolve(import.meta.dir, "../drizzle")

describe("Database", () => {
  test("opens an in-memory database, applies the committed migrations and round-trips rows", async () => {
    const program = Effect.gen(function* smokeTest() {
      const db = yield* makeWithDefaults()
      yield* migrate(db, { migrationsFolder }).pipe(Effect.orDie)

      yield* db
        .insert(profiles)
        .values({ name: "work", apiKey: "secret", isDefault: 1 })
        .run()
        .pipe(Effect.orDie)
      const storedProfiles = yield* db.select().from(profiles).all().pipe(Effect.orDie)

      yield* db
        .insert(repositories)
        .values({ key: "/repo", team: "RAT", workspace: "work" })
        .run()
        .pipe(Effect.orDie)
      yield* db.insert(repositories).values({ key: "/other" }).run().pipe(Effect.orDie)
      const storedRepositories = yield* db.select().from(repositories).all().pipe(Effect.orDie)

      return { storedProfiles, storedRepositories }
    }).pipe(Effect.provide(SqliteClient.layer({ filename: ":memory:" })))

    const { storedProfiles, storedRepositories } = await Effect.runPromise(program)

    expect(storedProfiles).toEqual([{ name: "work", apiKey: "secret", isDefault: 1 }])
    expect(storedRepositories).toEqual([
      { key: "/repo", team: "RAT", project: null, workspace: "work" },
      { key: "/other", team: null, project: null, workspace: null },
    ])
  })
})
