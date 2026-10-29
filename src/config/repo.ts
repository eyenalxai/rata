import type { PlatformError } from "effect/PlatformError"

import { eq, inArray } from "drizzle-orm"
import { Console, Context, Effect, FileSystem, Layer, Option, Path, Result, Schema } from "effect"

import type { RepositoryLocation } from "@/config/repo-identity"

import { firstStoredKey, RepositoryIdentity } from "@/config/repo-identity"
import { Database } from "@/db/database"
import { repositories } from "@/db/schema"
import { storedPriority } from "@/domain/priority"

const RepoConfig = Schema.Struct({
  team: Schema.optional(Schema.String),
  project: Schema.optional(Schema.String),
  workspace: Schema.optional(Schema.String),
  defaultAssignee: Schema.optional(Schema.String),
  defaultLabels: Schema.optional(Schema.Array(Schema.String)),
  defaultPriority: Schema.optional(Schema.Int),
})

type RepoConfig = typeof RepoConfig.Type

const RepoConfigJson = Schema.fromJsonString(RepoConfig, { space: 2 })
const DefaultLabelsJson = Schema.fromJsonString(Schema.Array(Schema.String))

class RepoConfigError extends Schema.TaggedError<RepoConfigError>()("RepoConfigError", {
  message: Schema.String,
  cause: Schema.optional(Schema.Defect()),
}) {}

const describeStoreFailure =
  (action: string) =>
  (target: string) =>
  (cause: PlatformError): RepoConfigError =>
    new RepoConfigError({ message: `Could not ${action} ${target}.`, cause })

const describeQueryFailure =
  (action: string) =>
  (cause: unknown): RepoConfigError =>
    new RepoConfigError({ message: `Could not ${action} the repository config.`, cause })

type StoredRepository = typeof repositories.$inferSelect

const storedLabels = (
  value: string | null,
): Result.Result<Option.Option<readonly string[]>, RepoConfigError> => {
  if (value === null || value.trim().length === 0) {
    return Result.succeed(Option.none())
  }
  const decoded = Schema.decodeResult(DefaultLabelsJson)(value)
  if (Result.isFailure(decoded)) {
    return Result.fail(
      new RepoConfigError({
        message: "The stored default labels of the repository config are not valid JSON.",
        cause: decoded.failure,
      }),
    )
  }
  return Result.succeed(decoded.success.length === 0 ? Option.none() : Option.some(decoded.success))
}

const toConfig = (row: StoredRepository): Result.Result<RepoConfig, RepoConfigError> => {
  const labels = storedLabels(row.defaultLabels)
  if (Result.isFailure(labels)) {
    return Result.fail(labels.failure)
  }
  const priority = storedPriority(row.defaultPriority)
  return Result.succeed({
    ...(row.team === null ? {} : { team: row.team }),
    ...(row.project === null ? {} : { project: row.project }),
    ...(row.workspace === null ? {} : { workspace: row.workspace }),
    ...(row.defaultAssignee === null ? {} : { defaultAssignee: row.defaultAssignee }),
    ...(Option.isNone(labels.success) ? {} : { defaultLabels: labels.success.value }),
    ...(priority === null ? {} : { defaultPriority: priority }),
  })
}

const currentDirectory: Effect.Effect<string> = Effect.sync(() => process.cwd())

type RepoConfigShape = {
  readonly read: (directory: string) => Effect.Effect<Option.Option<RepoConfig>, RepoConfigError>
  readonly write: (directory: string, config: RepoConfig) => Effect.Effect<void, RepoConfigError>
  readonly remove: (directory: string) => Effect.Effect<boolean, RepoConfigError>
}

class RepoConfigService extends Context.Service<RepoConfigService, RepoConfigShape>()(
  "rata-cli/config/repo/RepoConfigService",
) {
  static readonly layer = Layer.effect(
    RepoConfigService,
    Effect.gen(function* repoConfigLayer() {
      const database = yield* Database
      const identity = yield* RepositoryIdentity
      const fs = yield* FileSystem.FileSystem
      const path = yield* Path.Path

      const locate = (directory: string) =>
        identity
          .locate(directory)
          .pipe(
            Effect.mapError(
              (error) => new RepoConfigError({ message: error.message, cause: error }),
            ),
          )

      const findRow = Effect.fn("RepoConfig.findRow")(function* findStoredRow(
        location: RepositoryLocation,
      ) {
        const rows = yield* database.drizzle
          .select()
          .from(repositories)
          .where(inArray(repositories.key, location.lookup))
          .all()
          .pipe(Effect.mapError(describeQueryFailure("read")))
        const stored = new Set(rows.map((row) => row.key))
        const key = firstStoredKey(location, stored)
        return Option.flatMap(key, (value) =>
          Option.fromUndefinedOr(rows.find((row) => row.key === value)),
        )
      })

      const upsert = Effect.fn("RepoConfig.upsert")(function* upsertRow(
        key: string,
        config: RepoConfig,
      ) {
        const defaultLabels =
          config.defaultLabels === undefined || config.defaultLabels.length === 0
            ? null
            : yield* Schema.encodeEffect(DefaultLabelsJson)(config.defaultLabels).pipe(
                Effect.mapError(
                  (cause) =>
                    new RepoConfigError({
                      message: "Could not store the default labels of the repository config.",
                      cause,
                    }),
                ),
              )
        const columns = {
          team: config.team ?? null,
          project: config.project ?? null,
          workspace: config.workspace ?? null,
          defaultAssignee: config.defaultAssignee ?? null,
          defaultLabels,
          defaultPriority: storedPriority(config.defaultPriority),
        }
        yield* database.drizzle
          .insert(repositories)
          .values({ key, ...columns })
          .onConflictDoUpdate({ target: repositories.key, set: columns })
          .run()
          .pipe(Effect.mapError(describeQueryFailure("write")))
      })

      const legacyRoot = Effect.fn("RepoConfig.legacyRoot")(function* findLegacyRoot(
        directory: string,
      ) {
        let current = directory
        while (true) {
          const entry = path.join(current, ".git")
          const entryExists = yield* fs
            .exists(entry)
            .pipe(Effect.mapError(describeStoreFailure("read")(entry)))
          if (entryExists) {
            return Option.some(current)
          }
          const parent = path.dirname(current)
          if (parent === current) {
            return Option.none<string>()
          }
          current = parent
        }
      })

      const legacyCandidates = Effect.fn("RepoConfig.legacyCandidates")(
        function* collectLegacyCandidates(directory: string) {
          const start = path.resolve(directory)
          const root = yield* legacyRoot(start)
          const candidates = [start]
          let current = start
          while (Option.isSome(root) && current !== root.value) {
            current = path.dirname(current)
            candidates.push(current)
          }
          return candidates
        },
      )

      const findLegacyFile = Effect.fn("RepoConfig.findLegacyFile")(function* findNearestLegacyFile(
        directory: string,
      ) {
        const candidates = yield* legacyCandidates(directory)
        for (const candidate of candidates) {
          const file = path.join(candidate, ".rata.json")
          const fileExists = yield* fs
            .exists(file)
            .pipe(Effect.mapError(describeStoreFailure("read")(file)))
          if (fileExists) {
            return Option.some(file)
          }
        }
        return Option.none<string>()
      })

      const importLegacy = Effect.fn("RepoConfig.importLegacy")(function* importLegacyFile(
        key: string,
        file: string,
      ) {
        const content = yield* fs
          .readFileString(file)
          .pipe(Effect.mapError(describeStoreFailure("read")(file)))
        const decoded = Schema.decodeResult(RepoConfigJson)(content)
        if (Result.isFailure(decoded)) {
          return yield* new RepoConfigError({
            message: `The repository config at ${file} is not valid JSON.`,
          })
        }
        yield* upsert(key, decoded.success)
        yield* fs.remove(file).pipe(Effect.mapError(describeStoreFailure("remove")(file)))
        yield* Console.error(`Migrated repository config from ${file}.`)
        return Option.some(decoded.success)
      })

      const read = Effect.fn("RepoConfig.read")(function* readConfig(directory: string) {
        const location = yield* locate(directory)
        const row = yield* findRow(location)
        if (Option.isSome(row)) {
          const config = toConfig(row.value)
          if (Result.isFailure(config)) {
            return yield* config.failure
          }
          return Option.some(config.success)
        }
        const file = yield* findLegacyFile(directory)
        if (Option.isNone(file)) {
          return Option.none<RepoConfig>()
        }
        return yield* importLegacy(location.key, file.value)
      })

      const write = Effect.fn("RepoConfig.write")(function* writeConfig(
        directory: string,
        config: RepoConfig,
      ) {
        const location = yield* locate(directory)
        yield* upsert(location.key, config)
      })

      const remove = Effect.fn("RepoConfig.remove")(function* removeConfig(directory: string) {
        const location = yield* locate(directory)
        const row = yield* findRow(location)
        if (Option.isNone(row)) {
          return false
        }
        yield* database.drizzle
          .delete(repositories)
          .where(eq(repositories.key, row.value.key))
          .run()
          .pipe(Effect.mapError(describeQueryFailure("remove")))
        return true
      })

      return RepoConfigService.of({ read, remove, write })
    }),
  )
}

export { currentDirectory, RepoConfigError, RepoConfigService, type RepoConfig }
