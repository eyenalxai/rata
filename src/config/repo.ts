import type { PlatformError } from "effect/PlatformError"

import { eq, inArray } from "drizzle-orm"
import { Console, Context, Effect, FileSystem, Layer, Option, Path, Result, Schema } from "effect"

import type { RepositoryLocation } from "@/config/repo-identity"
import type { RepoConfig } from "@/config/repo/model"
import type { TeamId } from "@/domain/id"

import { firstStoredKey, RepositoryIdentity } from "@/config/repo-identity"
import { DefaultLabelsJson, decodeStoredRepository } from "@/config/repo/decode"
import { fromLegacyConfig, RepoConfigJson } from "@/config/repo/legacy"
import { Database } from "@/db/database"
import { repositories } from "@/db/schema"
import { isUuid } from "@/domain/id"
import { storedPriority } from "@/domain/priority"

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

const currentDirectory: Effect.Effect<string> = Effect.sync(() => process.cwd())

type RepoConfigShape = {
  readonly read: (directory: string) => Effect.Effect<Option.Option<RepoConfig>, RepoConfigError>
  readonly write: (directory: string, config: RepoConfig) => Effect.Effect<void, RepoConfigError>
  readonly remove: (directory: string) => Effect.Effect<boolean, RepoConfigError>
  readonly repairTeamId: (
    directory: string,
    teamId: TeamId,
  ) => Effect.Effect<boolean, RepoConfigError>
}

class RepoConfigService extends Context.Service<RepoConfigService, RepoConfigShape>()(
  "rata-cli/config/repo/RepoConfigService",
) {
  static readonly layer = Layer.effect(
    RepoConfigService,
    Effect.gen(function* repoConfigLayer() {
      const database = yield* Database
      const openedDatabase = database.open.pipe(
        Effect.mapError((cause) => new RepoConfigError({ message: cause.message, cause })),
      )
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
        const opened = yield* openedDatabase
        const rows = yield* opened.drizzle
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
          teamId: config.teamId ?? null,
          project: config.project ?? null,
          workspace: config.workspace ?? null,
          defaultAssignee: config.defaultAssignee ?? null,
          defaultLabels,
          defaultPriority:
            config.defaultPriority === undefined ? null : storedPriority(config.defaultPriority),
        }
        const opened = yield* openedDatabase
        yield* opened.drizzle
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

      const removeLegacy = Effect.fn("RepoConfig.removeLegacy")(function* removeLegacyFile(
        file: string,
      ) {
        yield* fs
          .remove(file)
          .pipe(
            Effect.catchTag("PlatformError", (error) =>
              error.reason._tag === "NotFound"
                ? Effect.void
                : Console.error(
                    `warning: Could not remove the legacy repository config at ${file}. Delete it to finish the migration.`,
                  ),
            ),
          )
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
        const imported = fromLegacyConfig(decoded.success)
        if (Result.isFailure(imported)) {
          return yield* new RepoConfigError({
            message: `The repository config at ${file} has ${imported.failure}`,
          })
        }
        yield* upsert(key, imported.success)
        yield* removeLegacy(file)
        yield* Console.error(`Migrated repository config from ${file}.`)
        return Option.some(imported.success)
      })

      const read = Effect.fn("RepoConfig.read")(function* readConfig(directory: string) {
        const location = yield* locate(directory)
        const row = yield* findRow(location)
        if (Option.isSome(row)) {
          const config = decodeStoredRepository(row.value)
          if (Result.isFailure(config)) {
            return yield* new RepoConfigError({
              message: config.failure.message,
              cause: config.failure.cause,
            })
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
        const opened = yield* openedDatabase
        yield* opened.drizzle
          .delete(repositories)
          .where(eq(repositories.key, row.value.key))
          .run()
          .pipe(Effect.mapError(describeQueryFailure("remove")))
        return true
      })

      const repairTeamId = Effect.fn("RepoConfig.repairTeamId")(function* repairStoredTeamId(
        directory: string,
        value: TeamId,
      ) {
        if (!isUuid(value)) {
          return yield* new RepoConfigError({
            message: `The stored team id ${value} is not a UUID.`,
          })
        }
        const location = yield* locate(directory)
        const row = yield* findRow(location)
        if (Option.isNone(row) || row.value.teamId === value) {
          return false
        }
        const opened = yield* openedDatabase
        yield* opened.drizzle
          .update(repositories)
          .set({ teamId: value })
          .where(eq(repositories.key, row.value.key))
          .run()
          .pipe(Effect.mapError(describeQueryFailure("repair")))
        return true
      })

      return RepoConfigService.of({ read, remove, repairTeamId, write })
    }),
  )
}

export { currentDirectory, RepoConfigError, RepoConfigService }
