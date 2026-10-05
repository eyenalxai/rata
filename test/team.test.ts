import type { GraphQLRequest, Handler } from "@test/fake-linear-model"

import { apiLayer, makeFakeLinear } from "@test/fake-linear"
import { inputOf } from "@test/fake-linear-model"
import { describe, expect, test } from "bun:test"
import { Effect, Layer, Terminal } from "effect"

import type { TeamCreateOptions } from "@/api/team"

import { TeamService } from "@/api/team"
import { confirm, isConfirmed } from "@/cli/confirm"

const team = { id: "team-1", key: "RAT", name: "Rata", timezone: "America/Los_Angeles" }

const run = <A, E>(handler: Handler, effect: Effect.Effect<A, E, TeamService>) =>
  effect.pipe(Effect.provide(apiLayer(handler)), Effect.runPromise)

const findTeam = (key: string) =>
  Effect.gen(function* lookupTeam() {
    const teams = yield* TeamService
    return yield* teams.byKey(key)
  })

const findTeamById = (id: string) =>
  Effect.gen(function* lookupTeamById() {
    const teams = yield* TeamService
    return yield* teams.byId(id)
  })

const createTeam = (options: TeamCreateOptions) =>
  Effect.gen(function* create() {
    const teams = yield* TeamService
    return yield* teams.create(options)
  })

const requestOf = (
  requests: readonly GraphQLRequest[],
  fragment: string,
): GraphQLRequest | undefined => requests.find((request) => request.query.includes(fragment))

const mutationOf = (requests: readonly GraphQLRequest[]): GraphQLRequest | undefined =>
  requestOf(requests, "mutation TeamCreate")

const hasQuery = (requests: readonly GraphQLRequest[], fragment: string): boolean =>
  requests.some((request) => request.query.includes(fragment))

const terminalLayer = (readLine: Effect.Effect<string, Terminal.QuitError>) =>
  Layer.succeed(
    Terminal.Terminal,
    Terminal.make({
      columns: Effect.succeed(80),
      rows: Effect.succeed(24),
      readInput: Effect.die("unused"),
      readLine,
      display: () => Effect.void,
    }),
  )

const runConfirm = (yes: boolean, readLine: Effect.Effect<string, Terminal.QuitError>) =>
  confirm("Delete team RAT (Rata)?", yes).pipe(
    Effect.provide(terminalLayer(readLine)),
    Effect.runPromise,
  )

describe("TeamService.byId", () => {
  test("finds the team and declares the id as an ID variable", async () => {
    const fake = makeFakeLinear({ teams: [team], labels: [] })
    const found = await run(fake.handler, findTeamById(team.id))
    expect(found).toEqual(team)
    const query = fake.requests.find((request) => request.query.includes("query TeamById"))
    expect(query?.query).toContain("$id: ID!")
  })

  test("fails when the team id does not exist", async () => {
    const fake = makeFakeLinear({ teams: [team], labels: [] })
    const error = await run(fake.handler, findTeamById("missing-id").pipe(Effect.flip))
    expect(error._tag).toBe("TeamNotFoundError")
  })
})

describe("TeamService.create", () => {
  test("omits the key, description and timezone when they are absent", async () => {
    const fake = makeFakeLinear({ teams: [team], labels: [] })
    await run(fake.handler, createTeam({ name: "Scratch" }))
    const create = mutationOf(fake.requests)
    expect(inputOf(create?.variables ?? {})).toEqual({ name: "Scratch" })
    expect(create?.variables.copySettingsFromTeamId).toBeUndefined()
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
})

describe("TeamService.byKey", () => {
  test("resolves a UUID through the team id", async () => {
    const id = "0f8fad5b-d9cb-469f-a165-70867728950e"
    const fake = makeFakeLinear({ teams: [{ ...team, id }], labels: [] })
    const found = await run(fake.handler, findTeam(id))
    expect(found.id).toBe(id)
    expect(hasQuery(fake.requests, "query TeamById")).toBe(true)
    expect(hasQuery(fake.requests, "query TeamByKey")).toBe(false)
  })
})

describe("isConfirmed", () => {
  test("accepts y and yes in any case", () => {
    expect(isConfirmed("y")).toBe(true)
    expect(isConfirmed("Y")).toBe(true)
    expect(isConfirmed("yes")).toBe(true)
    expect(isConfirmed("YES")).toBe(true)
    expect(isConfirmed(" yes ")).toBe(true)
  })

  test("rejects every other answer", () => {
    expect(isConfirmed("no")).toBe(false)
    expect(isConfirmed("n")).toBe(false)
    expect(isConfirmed("")).toBe(false)
    expect(isConfirmed("yeah")).toBe(false)
  })
})

describe("Cli.Confirm.confirm", () => {
  test("skips the prompt when yes is set", async () => {
    const confirmed = await runConfirm(true, Effect.die("unused"))
    expect(confirmed).toBe(true)
  })

  test("accepts yes", async () => {
    const confirmed = await runConfirm(false, Effect.succeed("yes"))
    expect(confirmed).toBe(true)
  })

  test("aborts when the answer is not y or yes", async () => {
    const confirmed = await runConfirm(false, Effect.succeed("no"))
    expect(confirmed).toBe(false)
  })

  test("aborts when the input ends without an answer", async () => {
    const confirmed = await runConfirm(false, Effect.fail(new Terminal.QuitError({})))
    expect(confirmed).toBe(false)
  })
})
