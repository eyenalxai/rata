import type { ApiLayerOptions } from "@test/fake-linear"
import type { GraphQLRequest, Handler } from "@test/fake-linear/model"

import { apiLayer, makeFakeLinear } from "@test/fake-linear"
import { inputOf } from "@test/fake-linear/model"
import { describe, expect, test } from "bun:test"
import { Effect } from "effect"

import type { ProjectCreateOptions } from "@/api/project/model"

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

const resolveProject = (ref: string) =>
  Effect.gen(function* resolve() {
    const projects = yield* ProjectService
    return yield* projects.resolve(ref)
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

describe("ProjectService.resolve", () => {
  test("reads a project by UUID without listing", async () => {
    const id = "0f8fad5b-d9cb-469f-a165-70867728950e"
    const tracker = { id, name: "Tracker", progress: 0.5, status: { name: "Started" } }
    const fake = makeFakeLinear({ teams: [], labels: [], projects: [tracker] })
    const found = await run(
      fake.handler,
      Effect.gen(function* resolve() {
        const service = yield* ProjectService
        return yield* service.resolve(id)
      }),
    )
    expect(found).toEqual({ ...tracker, trashed: false })
    const byId = fake.requests.find((request) => request.query.includes("query ProjectById"))
    expect(byId?.variables).toEqual({ id, includeArchived: true })
    expect(fake.requests.some((request) => request.query.includes("query Projects"))).toBe(false)
  })

  test("fails with the project list hint when no project matches the UUID", async () => {
    const id = "0f8fad5b-d9cb-469f-a165-70867728950e"
    const fake = makeFakeLinear({ teams: [], labels: [] })
    const error = await run(fake.handler, resolveProject(id).pipe(Effect.flip))
    expect(error._tag).toBe("ProjectNotFoundError")
    expect(error.message).toContain("project list")
  })

  test("fails when no project matches the name", async () => {
    const fake = makeFakeLinear({ teams: [], labels: [] })
    const error = await run(fake.handler, resolveProject("Nope").pipe(Effect.flip))
    expect(error._tag).toBe("ProjectNotFoundError")
    expect(error.message).toContain("project list")
  })

  test("fails when a UUID names a trashed project", async () => {
    const id = "0f8fad5b-d9cb-469f-a165-70867728950e"
    const trashed = {
      id,
      name: "Tracker",
      progress: 0,
      status: { name: "Backlog" },
      trashed: true,
    }
    const fake = makeFakeLinear({ teams: [], labels: [], projects: [trashed] })
    const error = await run(fake.handler, resolveProject(id).pipe(Effect.flip))
    expect(error._tag).toBe("ProjectAlreadyDeletedError")
    expect(error.message).toContain("project restore")
  })

  test("fails when several live projects share the name", async () => {
    const first = {
      id: "project-1",
      name: "Tracker",
      progress: 0.5,
      status: { name: "Started" },
    }
    const second = { id: "project-2", name: "tracker", progress: 0, status: { name: "Backlog" } }
    const fake = makeFakeLinear({ teams: [], labels: [], projects: [first, second] })
    const error = await run(fake.handler, resolveProject("Tracker").pipe(Effect.flip))
    expect(error._tag).toBe("ProjectNameAmbiguousError")
    expect(error.message).toContain("UUID")
  })

  test("fails when every match is in the trash", async () => {
    const trashed = {
      id: "project-1",
      name: "Tracker",
      progress: 0,
      status: { name: "Backlog" },
      trashed: true,
    }
    const fake = makeFakeLinear({ teams: [], labels: [], projects: [trashed] })
    const error = await run(fake.handler, resolveProject("tracker").pipe(Effect.flip))
    expect(error._tag).toBe("ProjectAlreadyDeletedError")
    expect(error.message).toContain("project restore")
  })

  test("prefers a live project over a trashed one", async () => {
    const live = { id: "project-1", name: "Tracker", progress: 0.5, status: { name: "Started" } }
    const trashed = {
      id: "project-2",
      name: "Tracker",
      progress: 0,
      status: { name: "Backlog" },
      trashed: true,
    }
    const fake = makeFakeLinear({ teams: [], labels: [], projects: [trashed, live] })
    const found = await run(fake.handler, resolveProject("Tracker"))
    expect(found.id).toBe("project-1")
  })

  test("finds a project by name across every page, ignoring case", async () => {
    const decoys = Array.from({ length: 50 }, (_, index) => ({
      id: `project-${index + 1}`,
      name: `Decoy ${index + 1}`,
      progress: 0,
      status: { name: "Backlog" },
    }))
    const tracker = {
      id: "project-51",
      name: "Tracker",
      progress: 0.5,
      status: { name: "Started" },
    }
    const fake = makeFakeLinear({ teams: [], labels: [], projects: [...decoys, tracker] })
    const found = await run(
      fake.handler,
      Effect.gen(function* resolve() {
        const service = yield* ProjectService
        return yield* service.resolve("tracker")
      }),
    )
    expect(found).toEqual({ ...tracker, trashed: false })
    const pages = fake.requests.filter((request) => request.query.includes("query Projects"))
    expect(pages.map((request) => request.variables)).toEqual([
      { first: 50, after: null, includeArchived: true },
      { first: 50, after: "project-50", includeArchived: true },
    ])
  })
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
        const project = yield* projects.resolve("Tracker")
        return yield* projects.delete(project)
      }),
    )
    expect(deleted).toEqual({ id: "project-1", name: "Tracker" })
    const mutation = fake.requests.find((request) =>
      request.query.includes("mutation ProjectDelete"),
    )
    expect(mutation?.variables).toEqual({ id: "project-1" })
  })

  test("maps a failed payload to a clear error", async () => {
    const fake = makeFakeLinear({ teams: [], labels: [] })
    const missing = {
      id: "project-404",
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
