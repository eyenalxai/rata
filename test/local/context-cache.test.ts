import { SqliteClient } from "@effect/sql-sqlite-bun"
import { defaultViewer } from "@test/fake-linear/model"
import { recordingConsoleWithErrors } from "@test/recording-console"
import { describe, expect, test } from "bun:test"
import { makeWithDefaults } from "drizzle-orm/effect-sqlite-bun"
import { Console, Effect, Layer, Option, Schema } from "effect"

import { Database } from "@/db/database"
import { TeamDetail } from "@/linear/decode/team"
import { Viewer } from "@/linear/decode/viewer"
import { ContextCache } from "@/local/context-cache"

const teamUuid = "0f8fad5b-d9cb-469f-a165-70867728950e"

const detail = Option.getOrThrow(
  Schema.decodeOption(TeamDetail)({
    id: teamUuid,
    key: "RAT",
    name: "Rata",
    timezone: "America/Los_Angeles",
    states: [],
    labels: [],
    members: [],
    priorities: [],
  }),
)

const viewer = Option.getOrThrow(Schema.decodeOption(Viewer)(defaultViewer))

const databaseWithoutMigrations = Layer.effect(
  Database,
  Effect.gen(function* openEmptyDatabase() {
    const drizzle = yield* makeWithDefaults()
    return Database.of({ open: Effect.succeed({ drizzle, file: ":memory:" }) })
  }),
).pipe(Layer.provide(SqliteClient.layer({ filename: ":memory:" })), Layer.orDie)

const cacheLayer = ContextCache.layer.pipe(Layer.provide(databaseWithoutMigrations))

describe("ContextCache advisory writes", () => {
  test("absorbs a failed write and an invalidation with a warning", async () => {
    const errors: string[] = []
    await Effect.gen(function* writeWithoutTables() {
      const cache = yield* ContextCache
      yield* cache.writeTeam("env", teamUuid, "key-hash", detail, 1)
      yield* cache.writeViewer("env", "key-hash", viewer, 1)
      yield* cache.invalidateTeam("env", teamUuid, "key-hash")
    }).pipe(
      Effect.provide(cacheLayer),
      Effect.provideService(Console.Console, recordingConsoleWithErrors([], errors)),
      Effect.runPromise,
    )

    expect(errors).toEqual([
      "warning: Could not write the context cache. The command continues without the cache.",
      "warning: Could not write the context cache. The command continues without the cache.",
      "warning: Could not invalidate the context cache. The command continues without the cache.",
    ])
  })
})
