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
import { Cause, ConfigProvider, Effect, FileSystem, Layer, Option, Path, Redacted } from "effect"

import { Auth } from "@/config/auth"
import { RepoConfigService } from "@/config/repo"
import { RepositoryIdentity } from "@/config/repo-identity"
import { Database, DatabaseError } from "@/db/database"
import { profiles } from "@/db/schema"

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

  test("leaves one default when two logins run at the same time", async () => {
    const rows = await runWithAuth(
      makeAuthHarness(),
      Effect.gen(function* concurrentLogin() {
        const auth = yield* Auth
        yield* Effect.all([auth.login("alpha-key", "alpha"), auth.login("beta-key", "beta")], {
          concurrency: "unbounded",
        })
        return yield* storedProfiles
      }),
    )

    expect(rows).toHaveLength(2)
    expect(rows.filter((row) => row.isDefault === 1)).toHaveLength(1)
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

describe("Profile defaults", () => {
  test("rejects a second default row in the database", async () => {
    const error = await runWithAuth(
      makeAuthHarness({
        profiles: [{ name: "default", apiKey: "default-key", isDefault: true }],
      }),
      Effect.gen(function* insertSecondDefault() {
        const database = yield* Database
        const opened = yield* database.open
        yield* opened.drizzle
          .insert(profiles)
          .values({ name: "work", apiKey: "work-key", isDefault: 1 })
          .run()
      }).pipe(Effect.flip),
    )

    expect(error._tag).toBe("EffectDrizzleQueryError")
    const cause = Cause.isCause(error.cause) ? error.cause : Cause.fail(error.cause)
    expect(Cause.squash(cause)).toMatchObject({
      _tag: "SqlError",
      reason: { _tag: "UniqueViolation", constraint: "profiles.is_default" },
    })
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
  test("removes a named profile and keeps the default", async () => {
    const result = await runWithAuth(
      makeAuthHarness({ profiles: twoProfiles }),
      Effect.gen(function* logoutWork() {
        const auth = yield* Auth
        const outcome = yield* auth.logout(Option.some("work"))
        const rows = yield* storedProfiles
        return { outcome, rows }
      }),
    )

    expect(result.outcome.removed).toEqual(Option.some("work"))
    expect(result.outcome.defaultProfile).toEqual(Option.some("default"))
    expect(result.outcome.remaining).toBe(1)
    expect(result.rows).toEqual([{ name: "default", apiKey: "default-key", isDefault: 1 }])
  })

  test("removes the named default and promotes the next profile by name", async () => {
    const result = await runWithAuth(
      makeAuthHarness({
        profiles: [
          { name: "alpha", apiKey: "alpha-key" },
          { name: "default", apiKey: "default-key", isDefault: true },
        ],
      }),
      Effect.gen(function* logoutDefaultByName() {
        const auth = yield* Auth
        const outcome = yield* auth.logout(Option.some("default"))
        const rows = yield* storedProfiles
        const resolved = yield* auth.require
        return { outcome, rows, resolved }
      }),
    )

    expect(result.outcome.removed).toEqual(Option.some("default"))
    expect(result.outcome.defaultProfile).toEqual(Option.some("alpha"))
    expect(result.outcome.remaining).toBe(1)
    expect(result.rows).toEqual([{ name: "alpha", apiKey: "alpha-key", isDefault: 1 }])
    expect(result.resolved.profile).toEqual(Option.some("alpha"))
    expect(Redacted.value(result.resolved.key)).toBe("alpha-key")
  })

  test("reports a missing profile as not removed and keeps the default", async () => {
    const result = await runWithAuth(
      makeAuthHarness({ profiles: twoProfiles }),
      Effect.gen(function* logoutMissing() {
        const auth = yield* Auth
        const outcome = yield* auth.logout(Option.some("nope"))
        const rows = yield* storedProfiles
        return { outcome, rows }
      }),
    )

    expect(Option.isNone(result.outcome.removed)).toBe(true)
    expect(result.outcome.defaultProfile).toEqual(Option.some("default"))
    expect(result.outcome.remaining).toBe(2)
    expect(result.rows).toHaveLength(2)
  })

  test("removes the default profile when no name is given and promotes the next by name", async () => {
    const result = await runWithAuth(
      makeAuthHarness({
        profiles: [
          { name: "alpha", apiKey: "alpha-key" },
          { name: "default", apiKey: "default-key", isDefault: true },
          { name: "work", apiKey: "work-key" },
        ],
      }),
      Effect.gen(function* logoutDefault() {
        const auth = yield* Auth
        const outcome = yield* auth.logout(Option.none())
        const rows = yield* storedProfiles
        const resolved = yield* auth.require
        return { outcome, rows, resolved }
      }),
    )

    expect(result.outcome.removed).toEqual(Option.some("default"))
    expect(result.outcome.defaultProfile).toEqual(Option.some("alpha"))
    expect(result.outcome.remaining).toBe(2)
    expect(result.rows).toEqual([
      { name: "alpha", apiKey: "alpha-key", isDefault: 1 },
      { name: "work", apiKey: "work-key", isDefault: 0 },
    ])
    expect(result.resolved.profile).toEqual(Option.some("alpha"))
    expect(Redacted.value(result.resolved.key)).toBe("alpha-key")
  })

  test("clears the default when the last profile is removed", async () => {
    const result = await runWithAuth(
      makeAuthHarness({ profiles: [{ name: "default", apiKey: "default-key", isDefault: true }] }),
      Effect.gen(function* logoutLast() {
        const auth = yield* Auth
        const outcome = yield* auth.logout(Option.none())
        const rows = yield* storedProfiles
        const resolved = yield* auth.resolve
        return { outcome, rows, resolved }
      }),
    )

    expect(result.outcome.removed).toEqual(Option.some("default"))
    expect(Option.isNone(result.outcome.defaultProfile)).toBe(true)
    expect(result.outcome.remaining).toBe(0)
    expect(result.rows).toEqual([])
    expect(Option.isNone(result.resolved)).toBe(true)
  })
})

describe("Auth database failures", () => {
  test("does not remap a database open failure to an auth error", async () => {
    const database = Layer.succeed(
      Database,
      Database.of({
        open: Effect.fail(new DatabaseError({ message: "Could not open the database." })),
      }),
    )
    const platform = Layer.mergeAll(
      FileSystem.layerNoop({}),
      Path.layer,
      ConfigProvider.layer(ConfigProvider.fromEnvRecord({ HOME: "/home/test" })),
    )
    const identity = RepositoryIdentity.layer.pipe(Layer.provide(platform))
    const repoConfig = RepoConfigService.layer.pipe(
      Layer.provide(Layer.mergeAll(platform, database, identity)),
    )
    const auth = Auth.layer.pipe(Layer.provide(Layer.mergeAll(repoConfig, platform, database)))

    const error = await Effect.gen(function* readProfiles() {
      const service = yield* Auth
      return yield* service.profiles
    }).pipe(Effect.provide(auth), Effect.flip, Effect.runPromise)

    expect(error._tag).toBe("DatabaseError")
  })
})
