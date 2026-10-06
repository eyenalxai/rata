import type { PlatformError } from "effect/PlatformError"

import { Context, Effect, FileSystem, Layer, Option, Path, Schema } from "effect"

type RepositoryLocation = {
  readonly key: string
  readonly lookup: readonly string[]
}

class RepositoryIdentityError extends Schema.TaggedError<RepositoryIdentityError>()(
  "RepositoryIdentityError",
  {
    message: Schema.String,
    cause: Schema.optional(Schema.Defect()),
  },
) {}

type RepositoryIdentityShape = {
  readonly locate: (directory: string) => Effect.Effect<RepositoryLocation, RepositoryIdentityError>
}

const firstStoredKey = (
  location: RepositoryLocation,
  stored: ReadonlySet<string>,
): Option.Option<string> => Option.fromUndefinedOr(location.lookup.find((key) => stored.has(key)))

const describeReadFailure =
  (target: string) =>
  (cause: PlatformError): RepositoryIdentityError =>
    new RepositoryIdentityError({ message: `Could not read ${target}.`, cause })

class RepositoryIdentity extends Context.Service<RepositoryIdentity, RepositoryIdentityShape>()(
  "rata-cli/config/repo-identity/RepositoryIdentity",
) {
  static readonly layer = Layer.effect(
    RepositoryIdentity,
    Effect.gen(function* repositoryIdentityLayer() {
      const fs = yield* FileSystem.FileSystem
      const path = yield* Path.Path

      const gitDirAt = Effect.fn("RepositoryIdentity.gitDirAt")(function* gitDirAt(entry: string) {
        const info = yield* fs.stat(entry).pipe(Effect.mapError(describeReadFailure(entry)))
        if (info.type === "Directory") {
          return entry
        }
        const content = yield* fs
          .readFileString(entry)
          .pipe(Effect.mapError(describeReadFailure(entry)))
        const gitdirLine = content.split("\n").find((line) => line.startsWith("gitdir:"))
        if (gitdirLine === undefined) {
          return yield* new RepositoryIdentityError({
            message: `The .git file at ${entry} has no gitdir line.`,
          })
        }
        const gitDir = path.resolve(path.dirname(entry), gitdirLine.slice("gitdir:".length).trim())
        const commonFile = path.join(gitDir, "commondir")
        const hasCommon = yield* fs
          .exists(commonFile)
          .pipe(Effect.mapError(describeReadFailure(commonFile)))
        if (!hasCommon) {
          return gitDir
        }
        const common = yield* fs
          .readFileString(commonFile)
          .pipe(Effect.mapError(describeReadFailure(commonFile)))
        return path.resolve(gitDir, common.trim())
      })

      const locate = Effect.fn("RepositoryIdentity.locate")(function* locateRepository(
        directory: string,
      ) {
        const start = path.resolve(directory)
        const lookup: string[] = []
        let current = start
        while (true) {
          lookup.push(current)
          const entry = path.join(current, ".git")
          const exists = yield* fs.exists(entry).pipe(Effect.mapError(describeReadFailure(entry)))
          if (exists) {
            const key = yield* gitDirAt(entry)
            return { key, lookup: [key] }
          }
          const parent = path.dirname(current)
          if (parent === current) {
            return { key: start, lookup }
          }
          current = parent
        }
      })

      return RepositoryIdentity.of({ locate })
    }),
  )
}

export { firstStoredKey, RepositoryIdentity, RepositoryIdentityError, type RepositoryLocation }
