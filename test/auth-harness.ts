import type { RepositorySeed } from "@test/database-harness"

import { databaseLayer } from "@test/database-harness"
import { ConfigProvider, Effect, FileSystem, Layer, Path, Schema } from "effect"

import { Auth } from "@/config/auth"
import { RepoConfigService } from "@/config/repo"
import { RepositoryIdentity } from "@/config/repo-identity"

type WriteRecord = {
  readonly path: string
  readonly content: string
  readonly mode: number | undefined
}

const authPath = "/home/test/.config/rata/auth.json"

const authFileJson = Schema.fromJsonString(
  Schema.Struct({
    default: Schema.optional(Schema.String),
    workspaces: Schema.Record(Schema.String, Schema.Struct({ apiKey: Schema.String })),
  }),
)

const profileFile = (workspaces: Record<string, string>, defaultName?: string): string => {
  const profiles = Object.fromEntries(
    Object.entries(workspaces).map(([name, apiKey]) => [name, { apiKey }]),
  )
  return JSON.stringify(
    defaultName === undefined
      ? { workspaces: profiles }
      : { default: defaultName, workspaces: profiles },
  )
}

const makeFileSystem = (files: Map<string, string>, writes: WriteRecord[], modes: number[]) =>
  FileSystem.layerNoop({
    exists: (file) => Effect.succeed(files.has(file)),
    readFileString: (file) => Effect.succeed(files.get(file) ?? ""),
    makeDirectory: () => Effect.void,
    writeFileString: (file, data, options) => {
      writes.push({ path: file, content: data, mode: options?.mode })
      files.set(file, data)
      return Effect.void
    },
    chmod: (_file, mode) => {
      modes.push(mode)
      return Effect.void
    },
    remove: (file) => {
      files.delete(file)
      return Effect.void
    },
  })

const testLayer = (
  env: Record<string, string>,
  files: Map<string, string>,
  repositories: readonly RepositorySeed[],
  writes: WriteRecord[] = [],
  modes: number[] = [],
) => {
  const platform = Layer.mergeAll(makeFileSystem(files, writes, modes), Path.layer)
  const database = databaseLayer(repositories)
  const identity = RepositoryIdentity.layer.pipe(Layer.provide(platform))
  const repoConfig = RepoConfigService.layer.pipe(
    Layer.provide(Layer.mergeAll(platform, database, identity)),
  )
  return Layer.mergeAll(
    Auth.layer.pipe(Layer.provide(Layer.mergeAll(repoConfig, platform))),
    ConfigProvider.layer(ConfigProvider.fromEnvRecord(env)),
  )
}

const runWithAuth = <A, E>(
  env: Record<string, string>,
  files: Map<string, string>,
  effect: Effect.Effect<A, E, Auth>,
  writes: WriteRecord[] = [],
  modes: number[] = [],
  repositories: readonly RepositorySeed[] = [],
) =>
  effect.pipe(Effect.provide(testLayer(env, files, repositories, writes, modes)), Effect.runPromise)

const runResolve = (
  env: Record<string, string>,
  files: Map<string, string>,
  repositories: readonly RepositorySeed[] = [],
) =>
  runWithAuth(
    env,
    files,
    Effect.gen(function* resolveAuth() {
      const auth = yield* Auth
      return yield* auth.resolve
    }),
    [],
    [],
    repositories,
  )

const runRequire = (
  env: Record<string, string>,
  files: Map<string, string>,
  repositories: readonly RepositorySeed[] = [],
) =>
  runWithAuth(
    env,
    files,
    Effect.gen(function* requireAuth() {
      const auth = yield* Auth
      return yield* auth.require
    }).pipe(Effect.flip),
    [],
    [],
    repositories,
  )

const decodeWrite = (writes: WriteRecord[]) =>
  Schema.decodeResult(authFileJson)(writes[0]?.content ?? "")

export { authPath, decodeWrite, profileFile, runRequire, runResolve, runWithAuth, type WriteRecord }
