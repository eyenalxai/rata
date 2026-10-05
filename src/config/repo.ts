import type { PlatformError } from "effect/PlatformError"

import { Context, Effect, FileSystem, Layer, Option, Path, Result, Schema } from "effect"

const RepoConfig = Schema.Struct({
  team: Schema.optional(Schema.String),
  project: Schema.optional(Schema.String),
})

type RepoConfig = typeof RepoConfig.Type

const RepoConfigJson = Schema.fromJsonString(RepoConfig)

class RepoConfigError extends Schema.TaggedError<RepoConfigError>()("RepoConfigError", {
  message: Schema.String,
  cause: Schema.optional(Schema.Defect()),
}) {}

const describeStoreFailure =
  (action: string) =>
  (target: string) =>
  (cause: PlatformError): RepoConfigError =>
    new RepoConfigError({ message: `Could not ${action} ${target}.`, cause })

type RepoConfigShape = {
  readonly read: Effect.Effect<Option.Option<RepoConfig>, RepoConfigError>
  readonly filePath: Effect.Effect<string, RepoConfigError>
}

class RepoConfigService extends Context.Service<RepoConfigService, RepoConfigShape>()(
  "rata-cli/config/repo/RepoConfigService",
) {
  static readonly layer = Layer.effect(
    RepoConfigService,
    Effect.gen(function* repoConfigLayer() {
      const fs = yield* FileSystem.FileSystem
      const path = yield* Path.Path

      const filePath = Effect.gen(function* resolveFilePath() {
        const cwd = yield* Effect.sync(() => process.cwd())
        return path.join(cwd, ".rata.json")
      })

      const read = Effect.gen(function* readConfig() {
        const file = yield* filePath
        const exists = yield* fs
          .exists(file)
          .pipe(Effect.mapError(describeStoreFailure("read")(file)))
        if (!exists) {
          return Option.none<RepoConfig>()
        }
        const content = yield* fs
          .readFileString(file)
          .pipe(Effect.mapError(describeStoreFailure("read")(file)))
        const decoded = Schema.decodeResult(RepoConfigJson)(content)
        if (Result.isFailure(decoded)) {
          return yield* new RepoConfigError({
            message: `The repository config at ${file} is not valid JSON.`,
          })
        }
        return Option.some(decoded.success)
      }).pipe(Effect.withSpan("RepoConfig.read"))

      return RepoConfigService.of({ read, filePath })
    }),
  )
}

export { RepoConfigService, type RepoConfig }
