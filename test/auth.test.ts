import type { WriteRecord } from "@test/auth-harness"

import {
  authPath,
  decodeWrite,
  profileFile,
  repoPath,
  runRequire,
  runResolve,
  runWithAuth,
} from "@test/auth-harness"
import { describe, expect, test } from "bun:test"
import { Effect, Option, Redacted, Result } from "effect"

import { Auth } from "@/config/auth"

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

  test("login rewrites a legacy single-key file in the new shape with mode 0600", async () => {
    const files = new Map([[authPath, JSON.stringify({ apiKey: "legacy-key" })]])
    const writes: WriteRecord[] = []
    const modes: number[] = []
    await runWithAuth(
      { HOME: "/home/test" },
      files,
      Effect.gen(function* login() {
        const auth = yield* Auth
        yield* auth.login("work-key", "work")
      }),
      writes,
      modes,
    )

    expect(writes.length).toBe(1)
    expect(writes[0]?.mode).toBe(0o600)
    const decoded = decodeWrite(writes)
    expect(Result.isSuccess(decoded)).toBe(true)
    if (Result.isSuccess(decoded)) {
      expect(decoded.success.default).toBe("default")
      expect(decoded.success.workspaces).toEqual({
        default: { apiKey: "legacy-key" },
        work: { apiKey: "work-key" },
      })
    }
    expect(modes).toEqual([0o600])
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

  test("logging out the default profile leaves the remaining profiles without a default", async () => {
    const files = new Map([
      [authPath, profileFile({ default: "default-key", work: "work-key" }, "default")],
    ])
    const error = await runWithAuth(
      { HOME: "/home/test" },
      files,
      Effect.gen(function* logoutDefault() {
        const auth = yield* Auth
        yield* auth.require
        yield* auth.logout("default")
        return yield* auth.require
      }).pipe(Effect.flip),
    )

    expect(error._tag).toBe("AuthStoreError")
    expect(error.message).toContain("No default workspace")
  })
})
