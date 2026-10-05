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

import { RepoConfigService } from "@/config/repo"

const WorkspaceProfile = Schema.Struct({ apiKey: Schema.String })

type WorkspaceProfile = typeof WorkspaceProfile.Type

const AuthFile = Schema.Struct({
  default: Schema.optional(Schema.String),
  workspaces: Schema.Record(Schema.String, WorkspaceProfile),
})

type AuthFile = typeof AuthFile.Type

const LegacyAuthFile = Schema.Struct({ apiKey: Schema.String })
const StoredAuth = Schema.Union([AuthFile, LegacyAuthFile])

type StoredAuth = typeof StoredAuth.Type

const StoredAuthJson = Schema.fromJsonString(StoredAuth)
const AuthFileJson = Schema.fromJsonString(AuthFile)
const normalize = (stored: StoredAuth): AuthFile =>
  "workspaces" in stored
    ? stored
    : { default: "default", workspaces: { default: { apiKey: stored.apiKey } } }

const withoutProfile = (
  profiles: Record<string, WorkspaceProfile>,
  name: string,
): Record<string, WorkspaceProfile> =>
  Object.fromEntries(Object.entries(profiles).filter(([key]) => key !== name))

class AuthStoreError extends Schema.TaggedError<AuthStoreError>()("AuthStoreError", {
  message: Schema.String,
  cause: Schema.optional(Schema.Defect()),
}) {}

type ResolvedAuth = {
  readonly key: Redacted.Redacted
  readonly source: "env" | "profile"
  readonly profile: Option.Option<string>
}

type StoredProfile = {
  readonly name: string
  readonly apiKey: Redacted.Redacted
  readonly isDefault: boolean
}

type AuthShape = {
  readonly resolve: Effect.Effect<Option.Option<ResolvedAuth>, AuthStoreError>
  readonly require: Effect.Effect<ResolvedAuth, AuthStoreError>
  readonly envKey: Effect.Effect<Option.Option<Redacted.Redacted>, AuthStoreError>
  readonly login: (apiKey: string, workspace: string) => Effect.Effect<void, AuthStoreError>
  readonly logout: (workspace: string) => Effect.Effect<boolean, AuthStoreError>
  readonly use: (workspace: string) => Effect.Effect<void, AuthStoreError>
  readonly profiles: Effect.Effect<readonly StoredProfile[], AuthStoreError>
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

const describeStoreFailure =
  (action: string) =>
  (target: string) =>
  (cause: PlatformError): AuthStoreError =>
    new AuthStoreError({ message: `Could not ${action} ${target}.`, cause })

const noWorkspace = (workspace: string): AuthStoreError =>
  new AuthStoreError({
    message: `No workspace named "${workspace}" in the auth file. Run \`rata auth login --workspace ${workspace} --with-token\` to add it.`,
  })

const readEnvKey = Config.Redacted("LINEAR_API_KEY").pipe(
  Config.option,
  Effect.mapError(() => new AuthStoreError({ message: "Could not read LINEAR_API_KEY." })),
)

class Auth extends Context.Service<Auth, AuthShape>()("rata-cli/config/auth") {
  static readonly layer = Layer.effect(
    Auth,
    Effect.gen(function* authLayer() {
      const fs = yield* FileSystem.FileSystem
      const path = yield* Path.Path
      const repoConfig = yield* RepoConfigService

      const storePath = makeConfigHome(path).pipe(
        Effect.map((base) => path.join(base, "rata", "auth.json")),
        Effect.withSpan("Auth.storePath"),
      )

      const readFile = Effect.fn("Auth.readFile")(function* readStoredAuth() {
        const file = yield* storePath
        const exists = yield* fs
          .exists(file)
          .pipe(Effect.mapError(describeStoreFailure("read")(file)))
        if (!exists) {
          return Option.none<AuthFile>()
        }
        const content = yield* fs
          .readFileString(file)
          .pipe(Effect.mapError(describeStoreFailure("read")(file)))
        const decoded = Schema.decodeResult(StoredAuthJson)(content)
        if (Result.isFailure(decoded)) {
          return yield* new AuthStoreError({
            message: `The auth file at ${file} is not a valid auth file.`,
          })
        }
        return Option.some(normalize(decoded.success))
      })

      const writeFile = Effect.fn("Auth.writeFile")(function* writeStoredAuth(file: AuthFile) {
        const target = yield* storePath
        const directory = path.dirname(target)
        yield* fs
          .makeDirectory(directory, { recursive: true })
          .pipe(Effect.mapError(describeStoreFailure("create")(directory)))
        const encoded = yield* Schema.encodeEffect(AuthFileJson)(file).pipe(
          Effect.mapError(
            () =>
              new AuthStoreError({
                message: `Could not encode the workspaces for ${target}.`,
              }),
          ),
        )
        yield* fs
          .writeFileString(target, encoded, { mode: 0o600 })
          .pipe(Effect.mapError(describeStoreFailure("write")(target)))
        yield* fs.chmod(target, 0o600).pipe(Effect.mapError(describeStoreFailure("secure")(target)))
      })

      const envKey = readEnvKey.pipe(Effect.withSpan("Auth.envKey"))

      const resolveAuth = Effect.fn("Auth.resolve")(function* resolveAuth() {
        const env = yield* readEnvKey
        if (Option.isSome(env)) {
          return Option.some({
            key: env.value,
            source: "env" as const,
            profile: Option.none<string>(),
          })
        }
        const requested = Option.flatMap(
          yield* repoConfig.read.pipe(
            Effect.mapError(
              (error) => new AuthStoreError({ message: error.message, cause: error.cause }),
            ),
          ),
          (config) => Option.fromUndefinedOr(config.workspace),
        )
        const stored = yield* readFile()
        if (Option.isSome(requested)) {
          const name = requested.value
          const profile = Option.flatMap(stored, (file) =>
            Option.fromUndefinedOr(file.workspaces[name]),
          )
          if (Option.isNone(profile)) {
            return yield* noWorkspace(name)
          }
          return Option.some({
            key: Redacted.make(profile.value.apiKey),
            source: "profile" as const,
            profile: Option.some(name),
          })
        }
        const defaultName = Option.flatMap(stored, (file) => Option.fromUndefinedOr(file.default))
        if (Option.isNone(defaultName)) {
          if (Option.isSome(stored) && Object.keys(stored.value.workspaces).length > 0) {
            return yield* new AuthStoreError({
              message: "No default workspace. Run `rata workspace use <name>`.",
            })
          }
          return Option.none<ResolvedAuth>()
        }
        const name = defaultName.value
        const profile = Option.flatMap(stored, (file) =>
          Option.fromUndefinedOr(file.workspaces[name]),
        )
        if (Option.isNone(profile)) {
          return yield* new AuthStoreError({
            message: `The default workspace "${name}" is not in the auth file. Run \`rata workspace use <name>\`.`,
          })
        }
        return Option.some({
          key: Redacted.make(profile.value.apiKey),
          source: "profile" as const,
          profile: Option.some(name),
        })
      })

      const resolve = resolveAuth()

      const requireAuth = Effect.fn("Auth.require")(function* requireAuth() {
        const resolved = yield* resolve
        if (Option.isNone(resolved)) {
          return yield* new AuthStoreError({
            message:
              "Not authenticated. Run `rata auth login --with-token`, or set LINEAR_API_KEY.",
          })
        }
        return resolved.value
      })

      const require = requireAuth()

      const login = Effect.fn("Auth.login")(function* loginWithToken(
        apiKey: string,
        workspace: string,
      ) {
        const stored = yield* readFile()
        const file: AuthFile = Option.isSome(stored)
          ? {
              default: stored.value.default ?? workspace,
              workspaces: { ...stored.value.workspaces, [workspace]: { apiKey } },
            }
          : { default: workspace, workspaces: { [workspace]: { apiKey } } }
        yield* writeFile(file)
      })

      const logout = Effect.fn("Auth.logout")(function* logoutStoredKey(workspace: string) {
        const file = yield* storePath
        const stored = yield* readFile()
        if (Option.isNone(stored) || stored.value.workspaces[workspace] === undefined) {
          return false
        }
        const workspaces = withoutProfile(stored.value.workspaces, workspace)
        if (Object.keys(workspaces).length === 0) {
          yield* fs.remove(file).pipe(Effect.mapError(describeStoreFailure("remove")(file)))
          return true
        }
        const next: AuthFile =
          stored.value.default === undefined || stored.value.default === workspace
            ? { workspaces }
            : { default: stored.value.default, workspaces }
        yield* writeFile(next)
        return true
      })

      const use = Effect.fn("Auth.use")(function* useWorkspace(workspace: string) {
        const stored = yield* readFile()
        if (Option.isNone(stored) || stored.value.workspaces[workspace] === undefined) {
          return yield* noWorkspace(workspace)
        }
        return yield* writeFile({ default: workspace, workspaces: stored.value.workspaces })
      })

      const profiles: Effect.Effect<readonly StoredProfile[], AuthStoreError> = Effect.gen(
        function* listProfiles() {
          const stored = yield* readFile()
          if (Option.isNone(stored)) {
            return []
          }
          return Object.entries(stored.value.workspaces).map(([name, profile]) => ({
            name,
            apiKey: Redacted.make(profile.apiKey),
            isDefault: stored.value.default === name,
          }))
        },
      ).pipe(Effect.withSpan("Auth.profiles"))

      return Auth.of({ envKey, login, logout, profiles, require, resolve, storePath, use })
    }),
  )
}

export { Auth, AuthStoreError, type StoredProfile }
