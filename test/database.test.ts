import { BunServices } from "@effect/platform-bun"
import { SqliteClient } from "@effect/sql-sqlite-bun"
import { describe, expect, test } from "bun:test"
import { makeWithDefaults } from "drizzle-orm/effect-sqlite-bun"
import { migrate } from "drizzle-orm/effect-sqlite-bun/migrator"
import { ConfigProvider, Effect, FileSystem, Layer } from "effect"
import path from "node:path"

import { Database } from "@/db/database"
import { profiles, repositories } from "@/db/schema"

const migrationsFolder = path.resolve(import.meta.dir, "../drizzle")
const platformLayer = BunServices.layer
const permissionBits = (mode: number) => mode % 0o1000

const databaseLayer = (env: Record<string, string>) =>
  Layer.merge(
    Database.layer.pipe(
      Layer.provide(platformLayer),
      Layer.provide(ConfigProvider.layer(ConfigProvider.fromEnvRecord(env))),
    ),
    platformLayer,
  )

const withTempDirectory = <A, E, R>(use: (directory: string) => Effect.Effect<A, E, R>) =>
  Effect.gen(function* tempDirectory() {
    const fs = yield* FileSystem.FileSystem
    return yield* Effect.scoped(
      Effect.gen(function* scopedDirectory() {
        const directory = yield* fs.makeTempDirectoryScoped({ prefix: "rata-database-" })
        return yield* use(directory)
      }),
    )
  })

const runWithDatabase = <A, E>(
  env: (directory: string) => Record<string, string>,
  use: (directory: string) => Effect.Effect<A, E, Database | FileSystem.FileSystem>,
) =>
  Effect.runPromise(
    withTempDirectory((directory) =>
      use(directory).pipe(Effect.provide(databaseLayer(env(directory)))),
    ).pipe(Effect.provide(platformLayer)),
  )

describe("Drizzle stack", () => {
  test("applies the committed migrations in an in-memory database and round-trips rows", async () => {
    const program = Effect.gen(function* smokeTest() {
      const db = yield* makeWithDefaults()
      yield* migrate(db, { migrationsFolder })

      yield* db.insert(profiles).values({ name: "work", apiKey: "secret", isDefault: 1 }).run()
      const storedProfiles = yield* db.select().from(profiles).all()

      yield* db.insert(repositories).values({ key: "/repo", team: "RAT", workspace: "work" }).run()
      yield* db.insert(repositories).values({ key: "/other" }).run()
      const storedRepositories = yield* db.select().from(repositories).all()

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

describe("Database", () => {
  test("opens a migration-current database under XDG_DATA_HOME and secures it", async () => {
    const result = await runWithDatabase(
      (directory) => ({ XDG_DATA_HOME: directory }),
      (directory) =>
        Effect.gen(function* openDatabase() {
          const fs = yield* FileSystem.FileSystem
          const database = yield* Database
          yield* database.drizzle
            .insert(repositories)
            .values({ key: "/repo", team: "RAT", workspace: "work" })
            .run()
          const rows = yield* database.drizzle.select().from(repositories).all()
          const dataDirectory = path.join(directory, "rata")
          const directoryInfo = yield* fs.stat(dataDirectory)
          const fileInfo = yield* fs.stat(path.join(dataDirectory, "rata.sqlite"))
          return {
            directoryMode: permissionBits(directoryInfo.mode),
            fileMode: permissionBits(fileInfo.mode),
            rows,
          }
        }),
    )

    expect(result.rows).toEqual([{ key: "/repo", team: "RAT", project: null, workspace: "work" }])
    expect(result.directoryMode).toBe(0o700)
    expect(result.fileMode).toBe(0o600)
  })

  test("falls back to HOME/.local/share without XDG_DATA_HOME", async () => {
    const result = await runWithDatabase(
      (directory) => ({ HOME: directory }),
      (directory) =>
        Effect.gen(function* openDatabase() {
          const fs = yield* FileSystem.FileSystem
          const database = yield* Database
          yield* database.drizzle.insert(profiles).values({ name: "work", apiKey: "secret" }).run()
          const storedProfiles = yield* database.drizzle.select().from(profiles).all()
          const file = path.join(directory, ".local", "share", "rata", "rata.sqlite")
          return { exists: yield* fs.exists(file), storedProfiles }
        }),
    )

    expect(result.exists).toBe(true)
    expect(result.storedProfiles).toEqual([{ name: "work", apiKey: "secret", isDefault: 0 }])
  })

  test("fails with a clear error when the environment has no data directory", async () => {
    const error = await Effect.runPromise(
      Database.pipe(Effect.provide(databaseLayer({})), Effect.flip),
    )

    expect(error._tag).toBe("DatabaseError")
    expect(error.message).toBe("Cannot find the data directory: set HOME or XDG_DATA_HOME.")
  })

  test("fails with a clear error when the database cannot be opened", async () => {
    const error = await Effect.runPromise(
      withTempDirectory((directory) =>
        Effect.gen(function* unopenable() {
          const fs = yield* FileSystem.FileSystem
          yield* fs.makeDirectory(path.join(directory, "rata", "rata.sqlite"), {
            recursive: true,
          })
          return yield* Database.pipe(Effect.provide(databaseLayer({ XDG_DATA_HOME: directory })))
        }),
      ).pipe(Effect.provide(platformLayer), Effect.flip),
    )

    expect(error._tag).toBe("DatabaseError")
    expect(error.message).toContain("Could not open the database")
  })

  test("keeps the data when the database opens again", async () => {
    const rows = await Effect.runPromise(
      withTempDirectory((directory) =>
        Effect.gen(function* reopen() {
          const layer = databaseLayer({ XDG_DATA_HOME: directory })
          yield* Database.use((database) =>
            database.drizzle.insert(repositories).values({ key: "/repo" }).run(),
          ).pipe(Effect.provide(layer))
          return yield* Database.use((database) =>
            database.drizzle.select().from(repositories).all(),
          ).pipe(Effect.provide(layer))
        }),
      ).pipe(Effect.provide(platformLayer)),
    )

    expect(rows).toEqual([{ key: "/repo", team: null, project: null, workspace: null }])
  })
})
