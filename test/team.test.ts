import type { Handler } from "@test/fake-linear"

import { apiLayer, makeFakeLinear } from "@test/fake-linear"
import { describe, expect, test } from "bun:test"
import { Effect } from "effect"

import { TeamService } from "@/api/team"

const team = { id: "team-1", key: "RAT", name: "Rata" }
const otherTeam = { id: "team-2", key: "OPS", name: "Operations" }

const listTeams = (handler: Handler) =>
  Effect.gen(function* runList() {
    const teams = yield* TeamService
    return yield* teams.list
  }).pipe(Effect.provide(apiLayer(handler)))

const findTeam = (handler: Handler, key: string) =>
  Effect.gen(function* lookupTeam() {
    const teams = yield* TeamService
    return yield* teams.byKey(key)
  }).pipe(Effect.provide(apiLayer(handler)))

describe("TeamService", () => {
  test("lists teams with key, name and id", async () => {
    const fake = makeFakeLinear({ teams: [team, otherTeam], projects: [], labels: [] })
    const teams = await listTeams(fake.handler).pipe(Effect.runPromise)
    expect(teams).toEqual([team, otherTeam])
    expect(fake.requests[0]?.query).toContain("teams(")
  })

  test("finds a team by key", async () => {
    const fake = makeFakeLinear({ teams: [team, otherTeam], projects: [], labels: [] })
    const found = await findTeam(fake.handler, "OPS").pipe(Effect.runPromise)
    expect(found).toEqual(otherTeam)
    expect(fake.requests[0]?.variables.key).toBe("OPS")
  })

  test("fails when the team key does not exist", async () => {
    const fake = makeFakeLinear({ teams: [team], projects: [], labels: [] })
    const error = await findTeam(fake.handler, "NOPE").pipe(Effect.flip, Effect.runPromise)
    expect(error._tag).toBe("TeamNotFoundError")
    if (error._tag === "TeamNotFoundError") {
      expect(error.key).toBe("NOPE")
    }
  })
})
