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

type WriteRecord = {
  readonly path: string
  readonly content: string
  readonly mode: number | undefined
}

const authFileJson = Schema.fromJsonString(Schema.Struct({ apiKey: Schema.String }))

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
) =>
  Layer.mergeAll(
    Auth.layer.pipe(
      Layer.provide(Layer.mergeAll(makeFileSystem(files, writes, modes), Path.layer)),
    ),
    ConfigProvider.layer(ConfigProvider.fromEnvRecord(env)),
  )

const runResolve = (env: Record<string, string>, files: Map<string, string>) =>
  Effect.gen(function* resolveAuth() {
    const auth = yield* Auth
    return yield* auth.resolve
  }).pipe(Effect.provide(testLayer(env, files)), Effect.runPromise)

const storedKeyFile = () =>
  new Map([["/home/test/.config/rata/auth.json", JSON.stringify({ apiKey: "file-key" })]])

describe("Auth", () => {
  test("prefers LINEAR_API_KEY over the stored key", async () => {
    const resolved = await runResolve(
      { HOME: "/home/test", LINEAR_API_KEY: "env-key" },
      storedKeyFile(),
    )
    expect(Option.isSome(resolved)).toBe(true)
    if (Option.isSome(resolved)) {
      expect(resolved.value.source).toBe("env")
      expect(Redacted.value(resolved.value.key)).toBe("env-key")
    }
  })

  test("falls back to the stored key", async () => {
    const resolved = await runResolve({ HOME: "/home/test" }, storedKeyFile())
    expect(Option.isSome(resolved)).toBe(true)
    if (Option.isSome(resolved)) {
      expect(resolved.value.source).toBe("file")
      expect(Redacted.value(resolved.value.key)).toBe("file-key")
    }
  })

  test("requires a key", async () => {
    const error = await Effect.gen(function* requireAuth() {
      const auth = yield* Auth
      return yield* auth.require
    }).pipe(
      Effect.provide(testLayer({ HOME: "/home/test" }, new Map())),
      Effect.flip,
      Effect.runPromise,
    )
    expect(error._tag).toBe("AuthStoreError")
  })

  test("stores a key with mode 0600", async () => {
    const files = new Map<string, string>()
    const writes: WriteRecord[] = []
    const modes: number[] = []
    await Effect.gen(function* login() {
      const auth = yield* Auth
      yield* auth.login("lin_api_test")
    }).pipe(
      Effect.provide(testLayer({ HOME: "/home/test" }, files, writes, modes)),
      Effect.runPromise,
    )

    expect(writes.length).toBe(1)
    expect(writes[0]?.path).toBe("/home/test/.config/rata/auth.json")
    expect(writes[0]?.mode).toBe(0o600)
    const decoded = Schema.decodeResult(authFileJson)(writes[0]?.content ?? "")
    expect(Result.isSuccess(decoded)).toBe(true)
    if (Result.isSuccess(decoded)) {
      expect(decoded.success.apiKey).toBe("lin_api_test")
    }
    expect(modes).toEqual([0o600])
  })
})
