import type { EffectSQLiteBunDatabase } from "drizzle-orm/effect-sqlite-bun"

import { SqliteClient } from "@effect/sql-sqlite-bun"
import { makeWithDefaults } from "drizzle-orm/effect-sqlite-bun"
import { migrate } from "drizzle-orm/effect-sqlite-bun/migrator"
import { Config, Context, Effect, FileSystem, Layer, Option, Path, Schema } from "effect"

class DatabaseError extends Schema.TaggedError<DatabaseError>()("DatabaseError", {
  message: Schema.String,
  cause: Schema.optional(Schema.Defect()),
}) {}

type DatabaseShape = {
  readonly file: string
  readonly drizzle: EffectSQLiteBunDatabase
}

const describeStoreFailure =
  (action: string) =>
  (target: string) =>
  (cause: unknown): DatabaseError =>
    new DatabaseError({ message: `Could not ${action} ${target}.`, cause })

const readEnvironment = (name: string) =>
  Config.String(name).pipe(
    Config.option,
    Effect.mapError(() => new DatabaseError({ message: "Could not read the environment." })),
  )

const resolveDatabaseFile = (path: Path.Path) =>
  Effect.gen(function* databaseFile() {
    const xdgDataHome = yield* readEnvironment("XDG_DATA_HOME")
    const home = yield* readEnvironment("HOME")
    const base = Option.orElse(xdgDataHome, () =>
      Option.map(home, (directory) => path.join(directory, ".local", "share")),
    )
    if (Option.isNone(base)) {
      return yield* new DatabaseError({
        message: "Cannot find the data directory: set HOME or XDG_DATA_HOME.",
      })
    }
    return path.join(base.value, "rata", "rata.sqlite")
  })

class Database extends Context.Service<Database, DatabaseShape>()("rata-cli/db/database") {
  static readonly layer = Layer.unwrap(
    Effect.gen(function* databaseLayer() {
      const fs = yield* FileSystem.FileSystem
      const path = yield* Path.Path
      const file = yield* resolveDatabaseFile(path)
      const directory = path.dirname(file)
      yield* fs
        .makeDirectory(directory, { recursive: true, mode: 0o700 })
        .pipe(Effect.mapError(describeStoreFailure("create")(directory)))
      yield* fs
        .chmod(directory, 0o700)
        .pipe(Effect.mapError(describeStoreFailure("secure")(directory)))

      return Layer.effect(
        Database,
        Effect.gen(function* openDatabase() {
          const clientContext = yield* Layer.build(SqliteClient.layer({ filename: file })).pipe(
            Effect.catchDefect((defect) =>
              Effect.fail(
                new DatabaseError({
                  message: `Could not open the database at ${file}.`,
                  cause: defect,
                }),
              ),
            ),
          )
          const drizzle = yield* makeWithDefaults().pipe(Effect.provideContext(clientContext))
          yield* fs.chmod(file, 0o600).pipe(Effect.mapError(describeStoreFailure("secure")(file)))
          yield* migrate(drizzle, {
            migrationsFolder: path.resolve(import.meta.dir, "..", "..", "drizzle"),
          }).pipe(Effect.mapError(describeStoreFailure("migrate")(file)))
          return Database.of({ drizzle, file })
        }),
      )
    }),
  )
}

export { Database, DatabaseError }
