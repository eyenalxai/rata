import type { EffectSQLiteBunDatabase } from "drizzle-orm/effect-sqlite-bun"

import { SqliteClient } from "@effect/sql-sqlite-bun"
import { makeWithDefaults } from "drizzle-orm/effect-sqlite-bun"
import { migrate } from "drizzle-orm/effect-sqlite-bun/migrator"
import {
  Config,
  Context,
  Effect,
  Exit,
  FileSystem,
  Layer,
  Option,
  Path,
  Schema,
  Scope,
} from "effect"

class DatabaseError extends Schema.TaggedError<DatabaseError>()("DatabaseError", {
  code: Schema.tag("internal"),
  message: Schema.String,
  cause: Schema.optional(Schema.Defect()),
}) {}

type OpenDatabase = {
  readonly file: string
  readonly drizzle: EffectSQLiteBunDatabase
}

type DatabaseShape = {
  readonly open: Effect.Effect<OpenDatabase, DatabaseError>
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

const migrationsCandidates = (
  path: Path.Path,
  moduleDirectory: string,
  executable: string,
): readonly string[] => [
  path.resolve(moduleDirectory, "..", "..", "drizzle"),
  path.resolve(moduleDirectory, "drizzle"),
  path.resolve(path.dirname(executable), "drizzle"),
  path.resolve(path.dirname(executable), "..", "share", "rata", "drizzle"),
]

const resolveMigrationsFolder = (fs: FileSystem.FileSystem, candidates: readonly string[]) =>
  Effect.gen(function* migrationsFolder() {
    for (const candidate of candidates) {
      const exists = yield* fs
        .exists(candidate)
        .pipe(Effect.mapError(describeStoreFailure("read")(candidate)))
      if (exists) {
        return candidate
      }
    }
    return yield* new DatabaseError({
      message: `Cannot find the Drizzle migrations folder. Looked in: ${candidates.join(", ")}.`,
    })
  })

const openDatabase = (
  fs: FileSystem.FileSystem,
  path: Path.Path,
  file: string,
  scope: Scope.Scope,
): Effect.Effect<OpenDatabase, DatabaseError> =>
  Effect.gen(function* openStoredDatabase() {
    const directory = path.dirname(file)
    yield* fs
      .makeDirectory(directory, { recursive: true, mode: 0o700 })
      .pipe(Effect.mapError(describeStoreFailure("create")(directory)))
    yield* fs
      .chmod(directory, 0o700)
      .pipe(Effect.mapError(describeStoreFailure("secure")(directory)))

    const clientContext = yield* Layer.buildWithScope(
      SqliteClient.layer({ filename: file }),
      scope,
    ).pipe(
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
    const migrationsFolder = yield* resolveMigrationsFolder(
      fs,
      migrationsCandidates(path, import.meta.dir, process.execPath),
    )
    yield* migrate(drizzle, { migrationsFolder }).pipe(
      Effect.mapError(describeStoreFailure("migrate")(file)),
    )
    return { drizzle, file }
  })

class Database extends Context.Service<Database, DatabaseShape>()("rata-cli/db/database") {
  static readonly layer = Layer.effect(
    Database,
    Effect.gen(function* databaseLayer() {
      const fs = yield* FileSystem.FileSystem
      const path = yield* Path.Path
      const file = yield* resolveDatabaseFile(path)
      const scope = yield* Scope.make("sequential")
      yield* Effect.addFinalizer(() => Scope.close(scope, Exit.void))
      return Database.of({ open: yield* Effect.cached(openDatabase(fs, path, file, scope)) })
    }),
  )
}

export { Database, DatabaseError, migrationsCandidates, type OpenDatabase }
