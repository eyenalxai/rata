import type { GraphQLRequest, Handler } from "@test/fake-linear/model"

import { apiLayer, makeFakeLinear } from "@test/fake-linear"
import { inputOf } from "@test/fake-linear/model"
import { ctrlC, fakeTerminal, key, typed } from "@test/terminal-harness"
import { describe, expect, test } from "bun:test"
import { Effect, Exit, FileSystem, Layer, Path, Terminal } from "effect"

import type { TeamCreateOptions } from "@/api/team"

import { TeamService } from "@/api/team"
import { confirm } from "@/cli/confirm"

const team = { id: "team-1", key: "RAT", name: "Rata", timezone: "America/Los_Angeles" }

const run = <A, E>(handler: Handler, effect: Effect.Effect<A, E, TeamService>) =>
  effect.pipe(Effect.provide(apiLayer(handler)), Effect.runPromise)

const findTeam = (teamKey: string) =>
  Effect.gen(function* lookupTeam() {
    const teams = yield* TeamService
    return yield* teams.byKey(teamKey)
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

const terminalLayer = (input: readonly Terminal.UserInput[]) =>
  Layer.mergeAll(
    FileSystem.layerNoop({}),
    Path.layer,
    Layer.succeed(Terminal.Terminal, fakeTerminal(input)),
  )

const valueOf = <A, E>(exit: Exit.Exit<A, E>): A | undefined =>
  Exit.isSuccess(exit) ? exit.value : undefined

const runConfirm = (yes: boolean, input: readonly Terminal.UserInput[]) =>
  confirm("Delete team RAT (Rata)?", yes).pipe(
    Effect.provide(terminalLayer(input)),
    Effect.runPromiseExit,
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

describe("Cli.Confirm.confirm", () => {
  test("skips the prompt when yes is set", async () => {
    const exit = await runConfirm(true, [])
    expect(valueOf(exit)).toBe(true)
  })

  test("accepts y", async () => {
    const exit = await runConfirm(false, [typed("y")])
    expect(valueOf(exit)).toBe(true)
  })

  test("accepts Enter as the default no", async () => {
    const exit = await runConfirm(false, [key("enter")])
    expect(valueOf(exit)).toBe(false)
  })

  test("interrupts when the input ends", async () => {
    const exit = await runConfirm(false, [ctrlC()])
    expect(Exit.hasInterrupts(exit)).toBe(true)
  })
})
