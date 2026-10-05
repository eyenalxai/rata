import type { Handler } from "@test/fake-linear"

import { apiLayer, makeFakeLinear } from "@test/fake-linear"
import { describe, expect, test } from "bun:test"
import { Effect } from "effect"

import { TeamService } from "@/api/team"

const team = { id: "team-1", key: "RAT", name: "Rata" }

const findTeam = (handler: Handler, key: string) =>
  Effect.gen(function* lookupTeam() {
    const teams = yield* TeamService
    return yield* teams.byKey(key)
  }).pipe(Effect.provide(apiLayer(handler)))

describe("TeamService", () => {
  test("fails when the team key does not exist", async () => {
    const fake = makeFakeLinear({ teams: [team], labels: [] })
    const error = await findTeam(fake.handler, "NOPE").pipe(Effect.flip, Effect.runPromise)
    expect(error._tag).toBe("TeamNotFoundError")
    if (error._tag === "TeamNotFoundError") {
      expect(error.key).toBe("NOPE")
    }
  })
})
