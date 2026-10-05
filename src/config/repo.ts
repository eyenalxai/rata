import type { PlatformError } from "effect/PlatformError"

import { Context, Effect, FileSystem, Layer, Option, Path, Result, Schema } from "effect"

const RepoConfig = Schema.Struct({
  team: Schema.optional(Schema.String),
  project: Schema.optional(Schema.String),
  workspace: Schema.optional(Schema.String),
})

type RepoConfig = typeof RepoConfig.Type

const RepoConfigJson = Schema.fromJsonString(RepoConfig, { space: 2 })

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
  readonly write: (config: RepoConfig) => Effect.Effect<void, RepoConfigError>
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

      const write = Effect.fn("RepoConfig.write")(function* writeConfig(config: RepoConfig) {
        const file = yield* filePath
        const encoded = yield* Schema.encodeEffect(RepoConfigJson)(config).pipe(
          Effect.mapError(
            () =>
              new RepoConfigError({
                message: `Could not encode the repository config for ${file}.`,
              }),
          ),
        )
        yield* fs
          .writeFileString(file, encoded)
          .pipe(Effect.mapError(describeStoreFailure("write")(file)))
      })

      return RepoConfigService.of({ read, write, filePath })
    }),
  )
}

export { RepoConfigError, RepoConfigService, type RepoConfig }
