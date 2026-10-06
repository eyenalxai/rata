import type { ApiLayerOptions } from "@test/fake-linear"
import type { GraphQLRequest, Handler } from "@test/fake-linear-model"

import { apiLayer, makeFakeLinear } from "@test/fake-linear"
import { inputOf } from "@test/fake-linear-model"
import { describe, expect, test } from "bun:test"
import { Effect } from "effect"

import type { ProjectCreateOptions } from "@/api/project"

import { ProjectService } from "@/api/project"

const team = { id: "team-1", key: "RAT", name: "Rata", timezone: "America/Los_Angeles" }
const otherTeam = { id: "team-2", key: "OPS", name: "Operations", timezone: "America/Los_Angeles" }

const run = <A, E>(
  handler: Handler,
  effect: Effect.Effect<A, E, ProjectService>,
  options: ApiLayerOptions = {},
) => effect.pipe(Effect.provide(apiLayer(handler, options)), Effect.runPromise)

const createProject = (options: ProjectCreateOptions) =>
  Effect.gen(function* create() {
    const projects = yield* ProjectService
    return yield* projects.create(options)
  })

const requestOf = (
  requests: readonly GraphQLRequest[],
  fragment: string,
): GraphQLRequest | undefined => requests.find((request) => request.query.includes(fragment))

const configWithTeam = (key: string): ApiLayerOptions => ({
  repositories: [{ key: process.cwd(), team: key }],
})

describe("ProjectService.list", () => {
  test("passes includeArchived and decodes the trashed flag", async () => {
    const projects = [
      { id: "project-1", name: "Tracker", progress: 0.5, status: { name: "Started" } },
      { id: "project-2", name: "Login", progress: 0, status: { name: "Backlog" }, trashed: true },
    ]
    const fake = makeFakeLinear({ teams: [], labels: [], projects })
    const page = await run(
      fake.handler,
      Effect.gen(function* listProjects() {
        const service = yield* ProjectService
        return yield* service.list({ after: null, limit: 50, includeArchived: true })
      }),
    )
    expect(fake.requests[0]?.variables).toEqual({ first: 50, after: null, includeArchived: true })
    expect(page.nodes).toEqual([
      {
        id: "project-1",
        name: "Tracker",
        progress: 0.5,
        status: { name: "Started" },
        trashed: false,
      },
      {
        id: "project-2",
        name: "Login",
        progress: 0,
        status: { name: "Backlog" },
        trashed: true,
      },
    ])
  })
})

describe("ProjectService.create", () => {
  test("uses the default team and sends the name and description", async () => {
    const fake = makeFakeLinear({ teams: [team], labels: [] })
    await run(
      fake.handler,
      createProject({ name: "Spec: login", description: "The login spec." }),
      configWithTeam("RAT"),
    )
    const create = requestOf(fake.requests, "mutation ProjectCreate")
    expect(inputOf(create?.variables ?? {})).toEqual({
      name: "Spec: login",
      description: "The login spec.",
      teamIds: ["team-1"],
    })
  })

  test("uses the explicit teams instead of the default team", async () => {
    const fake = makeFakeLinear({ teams: [team, otherTeam], labels: [] })
    const id = "0f8fad5b-d9cb-469f-a165-70867728950e"
    await run(
      fake.handler,
      createProject({ name: "Spec: login", teams: ["OPS", id] }),
      configWithTeam("RAT"),
    )
    const create = requestOf(fake.requests, "mutation ProjectCreate")
    expect(inputOf(create?.variables ?? {})).toEqual({
      name: "Spec: login",
      teamIds: ["team-2", id],
    })
    expect(requestOf(fake.requests, "query TeamByKey")?.variables).toEqual({
      key: "OPS",
      first: 50,
      after: null,
    })
  })

  test("fails without a team when the config has none", async () => {
    const fake = makeFakeLinear({ teams: [team], labels: [] })
    const error = await run(fake.handler, createProject({ name: "Spec: login" }).pipe(Effect.flip))
    expect(error._tag).toBe("TeamResolutionError")
    expect(requestOf(fake.requests, "mutation ProjectCreate")).toBeUndefined()
  })
})
