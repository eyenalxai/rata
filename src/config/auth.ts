import type { PlatformError } from "effect/PlatformError"

import {
  Config,
  Context,
  Effect,
  FileSystem,
  Layer,
  Option,
  Path,
  Redacted,
  Result,
  Schema,
} from "effect"

const AuthFile = Schema.Struct({ apiKey: Schema.String })
const AuthFileJson = Schema.fromJsonString(AuthFile)

class AuthStoreError extends Schema.TaggedError<AuthStoreError>()("AuthStoreError", {
  message: Schema.String,
  cause: Schema.optional(Schema.Defect()),
}) {}

type AuthSource = "env" | "file"

type ResolvedAuth = {
  readonly key: Redacted.Redacted
  readonly source: AuthSource
}

type AuthShape = {
  readonly resolve: Effect.Effect<Option.Option<ResolvedAuth>, AuthStoreError>
  readonly require: Effect.Effect<ResolvedAuth, AuthStoreError>
  readonly login: (apiKey: string) => Effect.Effect<void, AuthStoreError>
  readonly logout: Effect.Effect<boolean, AuthStoreError>
  readonly storePath: Effect.Effect<string, AuthStoreError>
}

const makeConfigHome = (path: Path.Path) =>
  Effect.gen(function* configHome() {
    const envFailure = new AuthStoreError({ message: "Could not read the environment." })
    const xdg = yield* Config.String("XDG_CONFIG_HOME").pipe(
      Config.option,
      Effect.mapError(() => envFailure),
    )
    const home = yield* Config.String("HOME").pipe(
      Config.option,
      Effect.mapError(() => envFailure),
    )
    const base = Option.orElse(xdg, () =>
      Option.map(home, (directory) => path.join(directory, ".config")),
    )
    if (Option.isNone(base)) {
      return yield* new AuthStoreError({
        message: "Cannot find the config directory: set HOME or XDG_CONFIG_HOME.",
      })
    }
    return base.value
  })

class Auth extends Context.Service<Auth, AuthShape>()("rata-cli/config/auth") {
  static readonly layer = Layer.effect(
    Auth,
    Effect.gen(function* authLayer() {
      const fs = yield* FileSystem.FileSystem
      const path = yield* Path.Path

      const storePath = makeConfigHome(path).pipe(
        Effect.map((base) => path.join(base, "rata", "auth.json")),
      )

      const describeStoreFailure =
        (action: string) =>
        (target: string) =>
        (cause: PlatformError): AuthStoreError =>
          new AuthStoreError({ message: `Could not ${action} ${target}.`, cause })

      const readStoredKey = Effect.gen(function* readStoredKey() {
        const file = yield* storePath
        const exists = yield* fs
          .exists(file)
          .pipe(Effect.mapError(describeStoreFailure("read")(file)))
        if (!exists) {
          return Option.none<string>()
        }
        const content = yield* fs
          .readFileString(file)
          .pipe(Effect.mapError(describeStoreFailure("read")(file)))
        const decoded = Schema.decodeResult(AuthFileJson)(content)
        if (Result.isFailure(decoded)) {
          return yield* new AuthStoreError({
            message: `The auth file at ${file} is not valid JSON.`,
          })
        }
        return Option.some(decoded.success.apiKey)
      })

      const resolve: Effect.Effect<Option.Option<ResolvedAuth>, AuthStoreError> = Effect.gen(
        function* resolveAuth() {
          const envKey = yield* Config.Redacted("LINEAR_API_KEY").pipe(
            Config.option,
            Effect.mapError(
              () =>
                new AuthStoreError({
                  message: "Could not read LINEAR_API_KEY from the environment.",
                }),
            ),
          )
          if (Option.isSome(envKey)) {
            return Option.some({ key: envKey.value, source: "env" as const })
          }
          const stored = yield* readStoredKey
          return Option.map(stored, (key) => ({ key: Redacted.make(key), source: "file" as const }))
        },
      )

      const require: Effect.Effect<ResolvedAuth, AuthStoreError> = Effect.gen(
        function* requireAuth() {
          const resolved = yield* resolve
          if (Option.isNone(resolved)) {
            return yield* new AuthStoreError({
              message:
                "Not authenticated. Run `rata auth login --with-token`, or set LINEAR_API_KEY.",
            })
          }
          return resolved.value
        },
      )

      const login = (apiKey: string) =>
        Effect.gen(function* loginWithToken() {
          const file = yield* storePath
          const directory = path.dirname(file)
          yield* fs
            .makeDirectory(directory, { recursive: true })
            .pipe(Effect.mapError(describeStoreFailure("create")(directory)))
          const encoded = yield* Schema.encodeEffect(AuthFileJson)({ apiKey }).pipe(
            Effect.mapError(
              () => new AuthStoreError({ message: `Could not encode the key for ${file}.` }),
            ),
          )
          yield* fs
            .writeFileString(file, encoded)
            .pipe(Effect.mapError(describeStoreFailure("write")(file)))
          yield* fs.chmod(file, 0o600).pipe(Effect.mapError(describeStoreFailure("secure")(file)))
        })

      const logout = Effect.gen(function* logoutStoredKey() {
        const file = yield* storePath
        const exists = yield* fs
          .exists(file)
          .pipe(Effect.mapError(describeStoreFailure("read")(file)))
        if (!exists) {
          return false
        }
        yield* fs.remove(file).pipe(Effect.mapError(describeStoreFailure("remove")(file)))
        return true
      })

      return Auth.of({ resolve, require, login, logout, storePath })
    }),
  )
}

export { Auth, AuthStoreError, type AuthSource, type ResolvedAuth }
