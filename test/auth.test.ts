import type { ProfileSeed } from "@test/database-harness"

import {
  authPath,
  makeAuthHarness,
  runRequire,
  runResolve,
  runWithAuth,
  storedProfiles,
} from "@test/auth-harness"
import { describe, expect, test } from "bun:test"
import { Effect, Option, Redacted } from "effect"

import { Auth } from "@/config/auth"

const twoProfiles: readonly ProfileSeed[] = [
  { name: "default", apiKey: "default-key", isDefault: true },
  { name: "work", apiKey: "work-key" },
]

describe("Auth.resolve", () => {
  test("prefers LINEAR_API_KEY over the repository workspace and the stored profiles", async () => {
    const resolved = await runResolve(
      makeAuthHarness({
        env: { HOME: "/home/test", LINEAR_API_KEY: "env-key" },
        profiles: twoProfiles,
        repositories: [{ key: process.cwd(), team: "RAT", workspace: "work" }],
      }),
    )
    expect(Option.isSome(resolved)).toBe(true)
    if (Option.isSome(resolved)) {
      expect(resolved.value.source).toBe("env")
      expect(Option.isNone(resolved.value.profile)).toBe(true)
      expect(Redacted.value(resolved.value.key)).toBe("env-key")
    }
  })

  test("selects the repository workspace over the default profile", async () => {
    const resolved = await runResolve(
      makeAuthHarness({
        profiles: twoProfiles,
        repositories: [{ key: process.cwd(), team: "RAT", workspace: "work" }],
      }),
    )
    expect(Option.isSome(resolved)).toBe(true)
    if (Option.isSome(resolved)) {
      expect(resolved.value.source).toBe("profile")
      expect(resolved.value.profile).toEqual(Option.some("work"))
      expect(Redacted.value(resolved.value.key)).toBe("work-key")
    }
  })

  test("fails when the repository workspace is missing", async () => {
    const error = await runRequire(
      makeAuthHarness({
        profiles: [{ name: "default", apiKey: "default-key", isDefault: true }],
        repositories: [{ key: process.cwd(), team: "RAT", workspace: "nope" }],
      }),
    )
    expect(error._tag).toBe("AuthStoreError")
    expect(error.message).toContain("nope")
  })

  test("falls back to the default profile", async () => {
    const resolved = await runResolve(makeAuthHarness({ profiles: twoProfiles }))
    expect(Option.isSome(resolved)).toBe(true)
    if (Option.isSome(resolved)) {
      expect(resolved.value.source).toBe("profile")
      expect(resolved.value.profile).toEqual(Option.some("default"))
      expect(Redacted.value(resolved.value.key)).toBe("default-key")
    }
  })
})

describe("Auth.login", () => {
  test("stores a profile and makes it the default when none is set", async () => {
    const rows = await runWithAuth(
      makeAuthHarness(),
      Effect.gen(function* login() {
        const auth = yield* Auth
        yield* auth.login("lin_api_test", "work")
        return yield* storedProfiles
      }),
    )

    expect(rows).toEqual([{ name: "work", apiKey: "lin_api_test", isDefault: 1 }])
  })

  test("keeps the existing default profile", async () => {
    const rows = await runWithAuth(
      makeAuthHarness({ profiles: [{ name: "default", apiKey: "default-key", isDefault: true }] }),
      Effect.gen(function* login() {
        const auth = yield* Auth
        yield* auth.login("work-key", "work")
        return yield* storedProfiles
      }),
    )

    expect(rows).toEqual([
      { name: "default", apiKey: "default-key", isDefault: 1 },
      { name: "work", apiKey: "work-key", isDefault: 0 },
    ])
  })

  test("replaces the key of an existing profile and keeps its default flag", async () => {
    const rows = await runWithAuth(
      makeAuthHarness({ profiles: [{ name: "work", apiKey: "old-key", isDefault: true }] }),
      Effect.gen(function* login() {
        const auth = yield* Auth
        yield* auth.login("new-key", "work")
        return yield* storedProfiles
      }),
    )

    expect(rows).toEqual([{ name: "work", apiKey: "new-key", isDefault: 1 }])
  })

  test("makes the profile the default when the stored profiles have none", async () => {
    const rows = await runWithAuth(
      makeAuthHarness({ profiles: [{ name: "work", apiKey: "old-key" }] }),
      Effect.gen(function* login() {
        const auth = yield* Auth
        yield* auth.login("new-key", "work")
        return yield* storedProfiles
      }),
    )

    expect(rows).toEqual([{ name: "work", apiKey: "new-key", isDefault: 1 }])
  })

  test("imports the legacy single-key file before adding a profile", async () => {
    const harness = makeAuthHarness({
      files: new Map([[authPath, JSON.stringify({ apiKey: "legacy-key" })]]),
    })
    const rows = await runWithAuth(
      harness,
      Effect.gen(function* login() {
        const auth = yield* Auth
        yield* auth.login("work-key", "work")
        return yield* storedProfiles
      }),
    )

    expect(rows).toEqual([
      { name: "default", apiKey: "legacy-key", isDefault: 1 },
      { name: "work", apiKey: "work-key", isDefault: 0 },
    ])
    expect(harness.files.has(authPath)).toBe(false)
    expect(harness.lines).toEqual([`Migrated auth profiles from ${authPath}.`])
  })
})

describe("Auth.use", () => {
  test("switches the default profile", async () => {
    const rows = await runWithAuth(
      makeAuthHarness({ profiles: twoProfiles }),
      Effect.gen(function* useWork() {
        const auth = yield* Auth
        yield* auth.use("work")
        return yield* storedProfiles
      }),
    )

    expect(rows).toEqual([
      { name: "default", apiKey: "default-key", isDefault: 0 },
      { name: "work", apiKey: "work-key", isDefault: 1 },
    ])
  })

  test("fails for a missing profile and changes nothing", async () => {
    const result = await runWithAuth(
      makeAuthHarness({ profiles: twoProfiles }),
      Effect.gen(function* useMissing() {
        const auth = yield* Auth
        const error = yield* Effect.flip(auth.use("nope"))
        const rows = yield* storedProfiles
        return { error, rows }
      }),
    )

    expect(result.error._tag).toBe("AuthStoreError")
    expect(result.error.message).toContain("nope")
    expect(result.rows).toEqual([
      { name: "default", apiKey: "default-key", isDefault: 1 },
      { name: "work", apiKey: "work-key", isDefault: 0 },
    ])
  })
})

describe("Auth.logout", () => {
  test("removes one profile and keeps the others", async () => {
    const result = await runWithAuth(
      makeAuthHarness({ profiles: twoProfiles }),
      Effect.gen(function* logoutWork() {
        const auth = yield* Auth
        const removed = yield* auth.logout("work")
        const rows = yield* storedProfiles
        return { removed, rows }
      }),
    )

    expect(result.removed).toBe(true)
    expect(result.rows).toEqual([{ name: "default", apiKey: "default-key", isDefault: 1 }])
  })

  test("reports a missing profile as not removed", async () => {
    const result = await runWithAuth(
      makeAuthHarness({ profiles: twoProfiles }),
      Effect.gen(function* logoutMissing() {
        const auth = yield* Auth
        const removed = yield* auth.logout("nope")
        const rows = yield* storedProfiles
        return { removed, rows }
      }),
    )

    expect(result.removed).toBe(false)
    expect(result.rows).toHaveLength(2)
  })

  test("logging out the default profile leaves the remaining profiles without a default", async () => {
    const error = await runWithAuth(
      makeAuthHarness({ profiles: twoProfiles }),
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

  test("logging out the last profile leaves the database empty", async () => {
    const result = await runWithAuth(
      makeAuthHarness({ profiles: [{ name: "default", apiKey: "default-key", isDefault: true }] }),
      Effect.gen(function* logoutLast() {
        const auth = yield* Auth
        const removed = yield* auth.logout("default")
        const rows = yield* storedProfiles
        return { removed, rows }
      }),
    )

    expect(result.removed).toBe(true)
    expect(result.rows).toEqual([])
  })
})
