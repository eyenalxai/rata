import {
  authPath,
  makeAuthHarness,
  profileFile,
  runWithAuth,
  storedProfiles,
} from "@test/auth-harness"
import { describe, expect, test } from "bun:test"
import { Effect, Option, Redacted } from "effect"

import { Auth } from "@/config/auth"

const migrationNotice = `Migrated auth profiles from ${authPath}.`

describe("Auth legacy migration", () => {
  test("imports a legacy single-key file as the default profile and deletes it", async () => {
    const harness = makeAuthHarness({
      files: new Map([[authPath, JSON.stringify({ apiKey: "file-key" })]]),
    })
    const result = await runWithAuth(
      harness,
      Effect.gen(function* migrateSingleKey() {
        const auth = yield* Auth
        const resolved = yield* auth.resolve
        const rows = yield* storedProfiles
        return { resolved, rows }
      }),
    )

    expect(result.rows).toEqual([{ name: "default", apiKey: "file-key", isDefault: 1 }])
    expect(Option.isSome(result.resolved)).toBe(true)
    if (Option.isSome(result.resolved)) {
      expect(result.resolved.value.profile).toEqual(Option.some("default"))
      expect(Redacted.value(result.resolved.value.key)).toBe("file-key")
    }
    expect(harness.files.has(authPath)).toBe(false)
    expect(harness.lines).toEqual([migrationNotice])
  })

  test("reads the legacy file from XDG_CONFIG_HOME", async () => {
    const xdgPath = "/xdg/config/rata/auth.json"
    const harness = makeAuthHarness({
      env: { HOME: "/home/test", XDG_CONFIG_HOME: "/xdg/config" },
      files: new Map([[xdgPath, JSON.stringify({ apiKey: "xdg-key" })]]),
    })
    const rows = await runWithAuth(
      harness,
      Effect.gen(function* migrateFromXdg() {
        const auth = yield* Auth
        yield* auth.resolve
        return yield* storedProfiles
      }),
    )

    expect(rows).toEqual([{ name: "default", apiKey: "xdg-key", isDefault: 1 }])
    expect(harness.files.has(xdgPath)).toBe(false)
    expect(harness.lines).toEqual([`Migrated auth profiles from ${xdgPath}.`])
  })

  test("imports a legacy profiles map with its default profile", async () => {
    const harness = makeAuthHarness({
      files: new Map([
        [authPath, profileFile({ default: "default-key", work: "work-key" }, "work")],
      ]),
    })
    const result = await runWithAuth(
      harness,
      Effect.gen(function* migrateProfilesMap() {
        const auth = yield* Auth
        const resolved = yield* auth.resolve
        const rows = yield* storedProfiles
        return { resolved, rows }
      }),
    )

    expect(result.rows).toEqual([
      { name: "default", apiKey: "default-key", isDefault: 0 },
      { name: "work", apiKey: "work-key", isDefault: 1 },
    ])
    expect(Option.isSome(result.resolved)).toBe(true)
    if (Option.isSome(result.resolved)) {
      expect(result.resolved.value.profile).toEqual(Option.some("work"))
      expect(Redacted.value(result.resolved.value.key)).toBe("work-key")
    }
    expect(harness.files.has(authPath)).toBe(false)
    expect(harness.lines).toEqual([migrationNotice])
  })

  test("never overwrites existing profiles and leaves the legacy file alone", async () => {
    const harness = makeAuthHarness({
      files: new Map([[authPath, profileFile({ work: "file-key" }, "work")]]),
      profiles: [{ name: "db", apiKey: "db-key", isDefault: true }],
    })
    const result = await runWithAuth(
      harness,
      Effect.gen(function* keepStoredProfiles() {
        const auth = yield* Auth
        const resolved = yield* auth.resolve
        const rows = yield* storedProfiles
        return { resolved, rows }
      }),
    )

    expect(result.rows).toEqual([{ name: "db", apiKey: "db-key", isDefault: 1 }])
    expect(Option.isSome(result.resolved)).toBe(true)
    if (Option.isSome(result.resolved)) {
      expect(Redacted.value(result.resolved.value.key)).toBe("db-key")
    }
    expect(harness.files.has(authPath)).toBe(true)
    expect(harness.lines).toEqual([])
  })

  test("fails on a corrupt legacy file and leaves it on disk", async () => {
    const harness = makeAuthHarness({
      files: new Map([[authPath, "{ not json"]]),
    })
    const result = await runWithAuth(
      harness,
      Effect.gen(function* corruptLegacy() {
        const auth = yield* Auth
        const error = yield* Effect.flip(auth.resolve)
        const rows = yield* storedProfiles
        return { error, rows }
      }),
    )

    expect(result.error._tag).toBe("AuthStoreError")
    if (result.error._tag === "AuthStoreError") {
      expect(result.error.message).toBe(`The auth file at ${authPath} is not a valid auth file.`)
    }
    expect(result.rows).toEqual([])
    expect(harness.files.has(authPath)).toBe(true)
    expect(harness.lines).toEqual([])
  })

  test("prints one notice when several commands read the profiles", async () => {
    const harness = makeAuthHarness({
      files: new Map([[authPath, JSON.stringify({ apiKey: "file-key" })]]),
    })
    await runWithAuth(
      harness,
      Effect.gen(function* readTwice() {
        const auth = yield* Auth
        yield* auth.resolve
        yield* auth.require
        yield* auth.profiles
      }),
    )

    expect(harness.lines).toEqual([migrationNotice])
  })
})
