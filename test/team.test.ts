import type { GraphQLRequest, Handler } from "@test/fake-linear"

import { apiLayer, inputOf, makeFakeLinear } from "@test/fake-linear"
import { describe, expect, test } from "bun:test"
import { Effect } from "effect"

import type { TeamCreateOptions } from "@/api/team"

import { TeamService } from "@/api/team"

const team = { id: "team-1", key: "RAT", name: "Rata" }

const run = <A, E>(handler: Handler, effect: Effect.Effect<A, E, TeamService>) =>
  effect.pipe(Effect.provide(apiLayer(handler)), Effect.runPromise)

const findTeam = (key: string) =>
  Effect.gen(function* lookupTeam() {
    const teams = yield* TeamService
    return yield* teams.byKey(key)
  })

const createTeam = (options: TeamCreateOptions) =>
  Effect.gen(function* create() {
    const teams = yield* TeamService
    return yield* teams.create(options)
  })

const mutationOf = (requests: readonly GraphQLRequest[]): GraphQLRequest | undefined =>
  requests.find((request) => request.query.includes("mutation TeamCreate"))

const hasQuery = (requests: readonly GraphQLRequest[], fragment: string): boolean =>
  requests.some((request) => request.query.includes(fragment))

describe("TeamService", () => {
  test("fails when the team key does not exist", async () => {
    const fake = makeFakeLinear({ teams: [team], labels: [] })
    const error = await run(fake.handler, findTeam("NOPE").pipe(Effect.flip))
    expect(error._tag).toBe("TeamNotFoundError")
    if (error._tag === "TeamNotFoundError") {
      expect(error.key).toBe("NOPE")
    }
  })
})

describe("TeamService.create", () => {
  test("sends the name with the key and description", async () => {
    const fake = makeFakeLinear({ teams: [team], labels: [] })
    await run(
      fake.handler,
      createTeam({ name: "Scratch", key: "SCR", description: "A scratch team." }),
    )
    const create = mutationOf(fake.requests)
    expect(inputOf(create?.variables ?? {})).toEqual({
      name: "Scratch",
      key: "SCR",
      description: "A scratch team.",
    })
    expect(create?.variables.copySettingsFromTeamId).toBeUndefined()
  })

  test("omits the key and description when they are absent", async () => {
    const fake = makeFakeLinear({ teams: [team], labels: [] })
    await run(fake.handler, createTeam({ name: "Scratch" }))
    const create = mutationOf(fake.requests)
    expect(inputOf(create?.variables ?? {})).toEqual({ name: "Scratch" })
  })

  test("resolves the copy-settings team key to its id", async () => {
    const fake = makeFakeLinear({ teams: [team], labels: [] })
    await run(fake.handler, createTeam({ name: "Scratch", copySettingsFrom: "RAT" }))
    const create = mutationOf(fake.requests)
    expect(create?.variables.copySettingsFromTeamId).toBe("team-1")
  })

  test("passes a copy-settings UUID through without a team lookup", async () => {
    const fake = makeFakeLinear({ teams: [team], labels: [] })
    const id = "0f8fad5b-d9cb-469f-a165-70867728950e"
    await run(fake.handler, createTeam({ name: "Scratch", copySettingsFrom: id }))
    const create = mutationOf(fake.requests)
    expect(create?.variables.copySettingsFromTeamId).toBe(id)
    expect(hasQuery(fake.requests, "query TeamByKey")).toBe(false)
  })

  test("fails before the mutation when the copy-settings team does not exist", async () => {
    const fake = makeFakeLinear({ teams: [team], labels: [] })
    const error = await run(
      fake.handler,
      createTeam({ name: "Scratch", copySettingsFrom: "NOPE" }).pipe(Effect.flip),
    )
    expect(error._tag).toBe("TeamNotFoundError")
    expect(hasQuery(fake.requests, "mutation TeamCreate")).toBe(false)
  })

  test("fails when Linear rejects the create", async () => {
    const fake = makeFakeLinear({ teams: [team], labels: [] }, { rejectTeamCreate: true })
    const error = await run(fake.handler, createTeam({ name: "Scratch" }).pipe(Effect.flip))
    expect(error._tag).toBe("TeamCreateError")
  })
})
