import type { ApiLayerOptions } from "@test/fake-linear"
import type { GraphQLRequest, Handler } from "@test/fake-linear/model"

import { apiLayer, makeFakeLinear } from "@test/fake-linear"
import { inputOf } from "@test/fake-linear/model"
import { describe, expect, test } from "bun:test"
import { Effect } from "effect"

import type { ProjectCreateOptions } from "@/linear/decode/project"

import { ProjectService } from "@/api/project"
import { projectId } from "@/domain/id"

const team = {
  id: "00000000-0000-0000-0000-000000000001",
  key: "RAT",
  name: "Rata",
  timezone: "America/Los_Angeles",
}
const otherTeam = { id: "team-2", key: "OPS", name: "Operations", timezone: "America/Los_Angeles" }

const run = <A, E>(
  handler: Handler,
  effect: Effect.Effect<A, E, ProjectService>,
  options: ApiLayerOptions = {},
) => effect.pipe(Effect.provide(apiLayer(handler, options)), Effect.runPromise)

const requestOf = (
  requests: readonly GraphQLRequest[],
  fragment: string,
): GraphQLRequest | undefined => requests.find((request) => request.query.includes(fragment))

const configWithTeam = (key: string): ApiLayerOptions => ({
  repositories: [{ key: process.cwd(), team: key }],
})

const createProject = (options: ProjectCreateOptions) =>
  Effect.gen(function* create() {
    const projects = yield* ProjectService
    return yield* projects.create(options)
  })

describe("ProjectService.delete", () => {
  test("sends the resolved id and returns the id and name", async () => {
    const tracker = {
      id: "project-1",
      name: "Tracker",
      progress: 0.5,
      status: { name: "Started" },
    }
    const fake = makeFakeLinear({ teams: [], labels: [], projects: [tracker] })
    const deleted = await run(
      fake.handler,
      Effect.gen(function* deleteProject() {
        const projects = yield* ProjectService
        return yield* projects.delete({
          id: projectId("project-1"),
          name: "Tracker",
          progress: 0.5,
          status: { name: "Started" },
          trashed: false,
        })
      }),
    )
    expect(deleted).toEqual({ id: projectId("project-1"), name: "Tracker" })
    const mutation = fake.requests.find((request) =>
      request.query.includes("mutation ProjectDelete"),
    )
    expect(mutation?.variables).toEqual({ id: "project-1" })
  })

  test("maps a failed payload to a clear error", async () => {
    const fake = makeFakeLinear({ teams: [], labels: [] })
    const missing = {
      id: projectId("project-404"),
      name: "Missing",
      progress: 0,
      status: { name: "Backlog" },
      trashed: false,
    }
    const error = await run(
      fake.handler,
      Effect.gen(function* deleteProject() {
        const projects = yield* ProjectService
        return yield* projects.delete(missing)
      }).pipe(Effect.flip),
    )
    expect(error._tag).toBe("ProjectDeleteError")
    expect(error.message).toContain("Missing")
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
      teamIds: ["00000000-0000-0000-0000-000000000001"],
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
  })

  test("fails without a team when the config has none", async () => {
    const fake = makeFakeLinear({ teams: [team], labels: [] })
    const error = await run(fake.handler, createProject({ name: "Spec: login" }).pipe(Effect.flip))
    expect(error._tag).toBe("TeamResolutionError")
    expect(requestOf(fake.requests, "mutation ProjectCreate")).toBeUndefined()
  })
})
