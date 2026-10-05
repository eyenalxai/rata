import { describe, expect, test } from "bun:test"
import {
  ConfigProvider,
  Effect,
  FileSystem,
  Layer,
  Option,
  Path,
  Redacted,
  Result,
  Schema,
} from "effect"

import { Auth } from "@/config/auth"
import { RepoConfigService } from "@/config/repo"

type WriteRecord = {
  readonly path: string
  readonly content: string
  readonly mode: number | undefined
}

const authPath = "/home/test/.config/rata/auth.json"

const repoPath = () => `${process.cwd()}/.rata.json`

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
  writes: WriteRecord[] = [],
  modes: number[] = [],
) => {
  const platform = Layer.mergeAll(makeFileSystem(files, writes, modes), Path.layer)
  const repoConfig = RepoConfigService.layer.pipe(Layer.provide(platform))
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
) => effect.pipe(Effect.provide(testLayer(env, files, writes, modes)), Effect.runPromise)

const runResolve = (env: Record<string, string>, files: Map<string, string>) =>
  runWithAuth(
    env,
    files,
    Effect.gen(function* resolveAuth() {
      const auth = yield* Auth
      return yield* auth.resolve
    }),
  )

const runRequire = (env: Record<string, string>, files: Map<string, string>) =>
  runWithAuth(
    env,
    files,
    Effect.gen(function* requireAuth() {
      const auth = yield* Auth
      return yield* auth.require
    }).pipe(Effect.flip),
  )

const decodeWrite = (writes: WriteRecord[]) =>
  Schema.decodeResult(authFileJson)(writes[0]?.content ?? "")

describe("Auth", () => {
  test("prefers LINEAR_API_KEY over the repository workspace and the stored profiles", async () => {
    const files = new Map([
      [authPath, profileFile({ default: "default-key", work: "work-key" }, "default")],
      [repoPath(), JSON.stringify({ team: "RAT", workspace: "work" })],
    ])
    const resolved = await runResolve({ HOME: "/home/test", LINEAR_API_KEY: "env-key" }, files)
    expect(Option.isSome(resolved)).toBe(true)
    if (Option.isSome(resolved)) {
      expect(resolved.value.source).toBe("env")
      expect(Option.isNone(resolved.value.profile)).toBe(true)
      expect(Redacted.value(resolved.value.key)).toBe("env-key")
    }
  })

  test("selects the repository workspace over the default profile", async () => {
    const files = new Map([
      [authPath, profileFile({ default: "default-key", work: "work-key" }, "default")],
      [repoPath(), JSON.stringify({ team: "RAT", workspace: "work" })],
    ])
    const resolved = await runResolve({ HOME: "/home/test" }, files)
    expect(Option.isSome(resolved)).toBe(true)
    if (Option.isSome(resolved)) {
      expect(resolved.value.source).toBe("profile")
      expect(resolved.value.profile).toEqual(Option.some("work"))
      expect(Redacted.value(resolved.value.key)).toBe("work-key")
    }
  })

  test("fails when the repository workspace is missing", async () => {
    const files = new Map([
      [authPath, profileFile({ default: "default-key" }, "default")],
      [repoPath(), JSON.stringify({ team: "RAT", workspace: "nope" })],
    ])
    const error = await runRequire({ HOME: "/home/test" }, files)
    expect(error._tag).toBe("AuthStoreError")
    expect(error.message).toContain("nope")
  })

  test("falls back to the default profile", async () => {
    const files = new Map([
      [authPath, profileFile({ default: "default-key", work: "work-key" }, "default")],
    ])
    const resolved = await runResolve({ HOME: "/home/test" }, files)
    expect(Option.isSome(resolved)).toBe(true)
    if (Option.isSome(resolved)) {
      expect(resolved.value.source).toBe("profile")
      expect(resolved.value.profile).toEqual(Option.some("default"))
      expect(Redacted.value(resolved.value.key)).toBe("default-key")
    }
  })

  test("reads a legacy single-key file as the default profile", async () => {
    const files = new Map([[authPath, JSON.stringify({ apiKey: "file-key" })]])
    const resolved = await runResolve({ HOME: "/home/test" }, files)
    expect(Option.isSome(resolved)).toBe(true)
    if (Option.isSome(resolved)) {
      expect(resolved.value.profile).toEqual(Option.some("default"))
      expect(Redacted.value(resolved.value.key)).toBe("file-key")
    }
  })

  test("requires a key", async () => {
    const error = await runRequire({ HOME: "/home/test" }, new Map())
    expect(error._tag).toBe("AuthStoreError")
  })

  test("stores a key as a profile with mode 0600", async () => {
    const files = new Map<string, string>()
    const writes: WriteRecord[] = []
    const modes: number[] = []
    await runWithAuth(
      { HOME: "/home/test" },
      files,
      Effect.gen(function* login() {
        const auth = yield* Auth
        yield* auth.login("lin_api_test", "work")
      }),
      writes,
      modes,
    )

    expect(writes.length).toBe(1)
    expect(writes[0]?.path).toBe(authPath)
    expect(writes[0]?.mode).toBe(0o600)
    const decoded = decodeWrite(writes)
    expect(Result.isSuccess(decoded)).toBe(true)
    if (Result.isSuccess(decoded)) {
      expect(decoded.success.default).toBe("work")
      expect(decoded.success.workspaces).toEqual({ work: { apiKey: "lin_api_test" } })
    }
    expect(modes).toEqual([0o600])
  })

  test("login keeps the existing default profile", async () => {
    const files = new Map([[authPath, profileFile({ default: "default-key" }, "default")]])
    const writes: WriteRecord[] = []
    await runWithAuth(
      { HOME: "/home/test" },
      files,
      Effect.gen(function* login() {
        const auth = yield* Auth
        yield* auth.login("work-key", "work")
      }),
      writes,
    )

    const decoded = decodeWrite(writes)
    expect(Result.isSuccess(decoded)).toBe(true)
    if (Result.isSuccess(decoded)) {
      expect(decoded.success.default).toBe("default")
      expect(decoded.success.workspaces).toEqual({
        default: { apiKey: "default-key" },
        work: { apiKey: "work-key" },
      })
    }
  })

  test("workspace use rewrites the default profile", async () => {
    const files = new Map([
      [authPath, profileFile({ default: "default-key", work: "work-key" }, "default")],
    ])
    const writes: WriteRecord[] = []
    await runWithAuth(
      { HOME: "/home/test" },
      files,
      Effect.gen(function* use() {
        const auth = yield* Auth
        yield* auth.use("work")
      }),
      writes,
    )

    const decoded = decodeWrite(writes)
    expect(Result.isSuccess(decoded)).toBe(true)
    if (Result.isSuccess(decoded)) {
      expect(decoded.success.default).toBe("work")
      expect(decoded.success.workspaces).toEqual({
        default: { apiKey: "default-key" },
        work: { apiKey: "work-key" },
      })
    }
  })

  test("workspace use rejects an unknown profile", async () => {
    const files = new Map([[authPath, profileFile({ default: "default-key" }, "default")]])
    const error = await runWithAuth(
      { HOME: "/home/test" },
      files,
      Effect.gen(function* use() {
        const auth = yield* Auth
        return yield* auth.use("nope")
      }).pipe(Effect.flip),
    )
    expect(error._tag).toBe("AuthStoreError")
  })

  test("logout removes one profile and keeps the others", async () => {
    const files = new Map([
      [authPath, profileFile({ default: "default-key", work: "work-key" }, "default")],
    ])
    const writes: WriteRecord[] = []
    const removed = await runWithAuth(
      { HOME: "/home/test" },
      files,
      Effect.gen(function* logout() {
        const auth = yield* Auth
        return yield* auth.logout("work")
      }),
      writes,
    )

    expect(removed).toBe(true)
    const decoded = decodeWrite(writes)
    expect(Result.isSuccess(decoded)).toBe(true)
    if (Result.isSuccess(decoded)) {
      expect(decoded.success.default).toBe("default")
      expect(decoded.success.workspaces).toEqual({ default: { apiKey: "default-key" } })
    }
  })
})
