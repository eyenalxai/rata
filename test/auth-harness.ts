import type { ProfileSeed, RepositorySeed } from "@test/database-harness"
import type { MemoryTree } from "@test/memory-file-system"

import { databaseLayer } from "@test/database-harness"
import { memoryFileSystem } from "@test/memory-file-system"
import { recordingConsole } from "@test/recording-console"
import { ConfigProvider, Console, Effect, Layer, Path } from "effect"

import { Auth } from "@/config/auth"
import { RepoConfigService } from "@/config/repo"
import { RepositoryIdentity } from "@/config/repo-identity"
import { Database } from "@/db/database"
import { profiles } from "@/db/schema"

const authPath = "/home/test/.config/rata/auth.json"

const profileFile = (workspaces: Record<string, string>, defaultName?: string): string => {
  const stored = Object.fromEntries(
    Object.entries(workspaces).map(([name, apiKey]) => [name, { apiKey }]),
  )
  return JSON.stringify(
    defaultName === undefined
      ? { workspaces: stored }
      : { default: defaultName, workspaces: stored },
  )
}

type AuthHarness = {
  readonly env: Readonly<Record<string, string>>
  readonly files: Map<string, string>
  readonly lines: string[]
  readonly profiles: readonly ProfileSeed[]
  readonly repositories: readonly RepositorySeed[]
}

const makeAuthHarness = (overrides: Partial<AuthHarness> = {}): AuthHarness => ({
  env: { HOME: "/home/test" },
  files: new Map(),
  lines: [],
  profiles: [],
  repositories: [],
  ...overrides,
})

const runWithAuth = <A, E>(
  harness: AuthHarness,
  use: Effect.Effect<A, E, Auth | Database>,
): Promise<A> => {
  const tree: MemoryTree = { directories: [], files: harness.files }
  const platform = Layer.mergeAll(memoryFileSystem(tree), Path.layer)
  const database = databaseLayer(harness.repositories, harness.profiles)
  const identity = RepositoryIdentity.layer.pipe(Layer.provide(platform))
  const repoConfig = RepoConfigService.layer.pipe(
    Layer.provide(Layer.mergeAll(platform, database, identity)),
  )
  const auth = Auth.layer.pipe(Layer.provide(Layer.mergeAll(repoConfig, platform, database)))
  return use.pipe(
    Effect.provide(
      Layer.mergeAll(
        auth,
        database,
        ConfigProvider.layer(ConfigProvider.fromEnvRecord(harness.env)),
      ),
    ),
    Effect.provideService(Console.Console, recordingConsole(harness.lines)),
    Effect.runPromise,
  )
}

const runResolve = (harness: AuthHarness) =>
  runWithAuth(
    harness,
    Effect.gen(function* resolveAuth() {
      const auth = yield* Auth
      return yield* auth.resolve
    }),
  )

const runRequire = (harness: AuthHarness) =>
  runWithAuth(
    harness,
    Effect.gen(function* requireAuth() {
      const auth = yield* Auth
      return yield* auth.require
    }).pipe(Effect.flip),
  )

const storedProfiles = Effect.gen(function* readStoredProfiles() {
  const database = yield* Database
  return yield* database.drizzle.select().from(profiles).orderBy(profiles.name).all()
})

export {
  authPath,
  makeAuthHarness,
  profileFile,
  runRequire,
  runResolve,
  runWithAuth,
  storedProfiles,
  type AuthHarness,
}
