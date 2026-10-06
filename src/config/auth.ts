import type { PlatformError } from "effect/PlatformError"

import { eq } from "drizzle-orm"
import {
  Config,
  Console,
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

import { currentDirectory, RepoConfigService } from "@/config/repo"
import { Database } from "@/db/database"
import { profiles } from "@/db/schema"
import { normalize, StoredAuthJson } from "@/domain/auth"

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

const describeQueryFailure =
  (action: string) =>
  (cause: unknown): AuthStoreError =>
    new AuthStoreError({ message: `Could not ${action} the stored profiles.`, cause })

const noWorkspace = (workspace: string): AuthStoreError =>
  new AuthStoreError({
    message: `No workspace named "${workspace}" in the stored profiles. Run \`rata auth login --workspace ${workspace} --with-token\` to add it.`,
  })

const readEnvKey = Config.Redacted("LINEAR_API_KEY").pipe(
  Config.option,
  Effect.mapError(() => new AuthStoreError({ message: "Could not read LINEAR_API_KEY." })),
)

class Auth extends Context.Service<Auth, AuthShape>()("rata-cli/config/auth") {
  static readonly layer = Layer.effect(
    Auth,
    Effect.gen(function* authLayer() {
      const database = yield* Database
      const fs = yield* FileSystem.FileSystem
      const path = yield* Path.Path
      const repoConfig = yield* RepoConfigService

      const storePath = Effect.succeed(database.file).pipe(Effect.withSpan("Auth.storePath"))

      const readRows = Effect.fn("Auth.readRows")(function* readStoredRows() {
        return yield* database.drizzle
          .select()
          .from(profiles)
          .orderBy(profiles.name)
          .all()
          .pipe(Effect.mapError(describeQueryFailure("read")))
      })

      const loadRows = Effect.fn("Auth.loadRows")(function* loadStoredRows() {
        const stored = yield* readRows()
        if (stored.length > 0) {
          return stored
        }
        const base = yield* makeConfigHome(path)
        const file = path.join(base, "rata", "auth.json")
        const exists = yield* fs
          .exists(file)
          .pipe(Effect.mapError(describeStoreFailure("read")(file)))
        if (!exists) {
          return stored
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
        const legacy = normalize(decoded.success)
        const rows = Object.entries(legacy.workspaces).map(([name, profile]) => ({
          name,
          apiKey: profile.apiKey,
          isDefault: legacy.default === name ? 1 : 0,
        }))
        if (rows.length > 0) {
          yield* database.drizzle
            .insert(profiles)
            .values(rows)
            .run()
            .pipe(Effect.mapError(describeQueryFailure("import")))
        }
        yield* fs.remove(file).pipe(Effect.mapError(describeStoreFailure("remove")(file)))
        yield* Console.error(`Migrated auth profiles from ${file}.`)
        return yield* readRows()
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
          yield* Effect.mapError(
            repoConfig.read(yield* currentDirectory),
            (error) => new AuthStoreError({ message: error.message, cause: error.cause }),
          ),
          (config) => Option.fromUndefinedOr(config.workspace),
        )
        const stored = yield* loadRows()
        if (Option.isSome(requested)) {
          const name = requested.value
          const profile = stored.find((row) => row.name === name)
          if (profile === undefined) {
            return yield* noWorkspace(name)
          }
          return Option.some({
            key: Redacted.make(profile.apiKey),
            source: "profile" as const,
            profile: Option.some(name),
          })
        }
        const defaultProfile = stored.find((row) => row.isDefault === 1)
        if (defaultProfile === undefined) {
          if (stored.length > 0) {
            return yield* new AuthStoreError({
              message: "No default workspace. Run `rata workspace use <name>`.",
            })
          }
          return Option.none<ResolvedAuth>()
        }
        return Option.some({
          key: Redacted.make(defaultProfile.apiKey),
          source: "profile" as const,
          profile: Option.some(defaultProfile.name),
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
        const stored = yield* loadRows()
        const hasDefault = stored.some((row) => row.isDefault === 1)
        const query = database.drizzle.insert(profiles).values({
          name: workspace,
          apiKey,
          isDefault: hasDefault ? 0 : 1,
        })
        const upsert = hasDefault
          ? query.onConflictDoUpdate({ target: profiles.name, set: { apiKey } })
          : query.onConflictDoUpdate({ target: profiles.name, set: { apiKey, isDefault: 1 } })
        yield* upsert.run().pipe(Effect.mapError(describeQueryFailure("write")))
      })

      const logout = Effect.fn("Auth.logout")(function* logoutStoredKey(workspace: string) {
        yield* loadRows()
        const removed = yield* database.drizzle
          .delete(profiles)
          .where(eq(profiles.name, workspace))
          .returning()
          .all()
          .pipe(Effect.mapError(describeQueryFailure("remove")))
        return removed.length > 0
      })

      const use = Effect.fn("Auth.use")(function* useWorkspace(workspace: string) {
        const stored = yield* loadRows()
        if (!stored.some((row) => row.name === workspace)) {
          return yield* noWorkspace(workspace)
        }
        return yield* database.drizzle
          .transaction((tx) =>
            Effect.gen(function* setDefaultProfile() {
              yield* tx
                .update(profiles)
                .set({ isDefault: 0 })
                .where(eq(profiles.isDefault, 1))
                .run()
              yield* tx
                .update(profiles)
                .set({ isDefault: 1 })
                .where(eq(profiles.name, workspace))
                .run()
            }),
          )
          .pipe(Effect.mapError(describeQueryFailure("write")))
      })

      const profilesList: Effect.Effect<readonly StoredProfile[], AuthStoreError> = Effect.gen(
        function* listStoredProfiles() {
          const stored = yield* loadRows()
          return stored.map((row) => ({
            name: row.name,
            apiKey: Redacted.make(row.apiKey),
            isDefault: row.isDefault === 1,
          }))
        },
      ).pipe(Effect.withSpan("Auth.profiles"))

      return Auth.of({
        envKey,
        login,
        logout,
        profiles: profilesList,
        require,
        resolve,
        storePath,
        use,
      })
    }),
  )
}

export { Auth, AuthStoreError, type StoredProfile }
