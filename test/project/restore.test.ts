import type { GraphQLRequest, Handler } from "@test/fake-linear/model"

import { apiLayer, makeFakeLinear } from "@test/fake-linear"
import { lastJson, runProject, tracker } from "@test/project/harness"
import { afterEach, describe, expect, test } from "bun:test"
import { Effect } from "effect"

import { ProjectService } from "@/api/project"

const trashed = { ...tracker, trashed: true }

const run = <A, E>(handler: Handler, effect: Effect.Effect<A, E, ProjectService>) =>
  effect.pipe(Effect.provide(apiLayer(handler)), Effect.runPromise)

const resolveTrashedProject = (ref: string) =>
  Effect.gen(function* resolveTrashed() {
    const projects = yield* ProjectService
    return yield* projects.resolveTrashed(ref)
  })

const unarchiveMutation = (requests: readonly GraphQLRequest[]): GraphQLRequest | undefined =>
  requests.find((request) => request.query.includes("mutation ProjectUnarchive"))

afterEach(() => {
  process.exitCode = 0
})

describe("ProjectService.resolveTrashed", () => {
  test("reads a trashed project by UUID without listing", async () => {
    const id = "0f8fad5b-d9cb-469f-a165-70867728950e"
    const fake = makeFakeLinear({ teams: [], labels: [], projects: [{ ...trashed, id }] })
    const found = await run(fake.handler, resolveTrashedProject(id))
    expect(found).toEqual({ ...tracker, id, trashed: true })
    const byId = fake.requests.find((request) => request.query.includes("query ProjectById"))
    expect(byId?.variables).toEqual({ id, includeArchived: true })
    expect(fake.requests.some((request) => request.query.includes("query Projects"))).toBe(false)
  })

  test("fails when no project matches the name", async () => {
    const fake = makeFakeLinear({ teams: [], labels: [] })
    const error = await run(fake.handler, resolveTrashedProject("Nope").pipe(Effect.flip))
    expect(error._tag).toBe("ProjectNotFoundError")
    expect(error.message).toContain("project list")
  })

  test("fails when the name matches only a live project", async () => {
    const fake = makeFakeLinear({ teams: [], labels: [], projects: [tracker] })
    const error = await run(fake.handler, resolveTrashedProject("Tracker").pipe(Effect.flip))
    expect(error._tag).toBe("ProjectNotDeletedError")
    expect(error.message).toContain("project delete")
  })

  test("fails when a UUID names a live project", async () => {
    const id = "0f8fad5b-d9cb-469f-a165-70867728950e"
    const fake = makeFakeLinear({ teams: [], labels: [], projects: [{ ...tracker, id }] })
    const error = await run(fake.handler, resolveTrashedProject(id).pipe(Effect.flip))
    expect(error._tag).toBe("ProjectNotDeletedError")
    expect(error.message).toContain("project delete")
  })

  test("fails when several trashed projects share the name", async () => {
    const other = { ...trashed, id: "project-2" }
    const fake = makeFakeLinear({ teams: [], labels: [], projects: [trashed, other] })
    const error = await run(fake.handler, resolveTrashedProject("Tracker").pipe(Effect.flip))
    expect(error._tag).toBe("ProjectNameAmbiguousError")
    expect(error.message).toContain("UUID")
  })

  test("prefers a trashed project over a live one", async () => {
    const other = { ...trashed, id: "project-2" }
    const fake = makeFakeLinear({ teams: [], labels: [], projects: [tracker, other] })
    const found = await run(fake.handler, resolveTrashedProject("tracker"))
    expect(found.id).toBe("project-2")
    expect(found.trashed).toBe(true)
  })

  test("finds a trashed project by name across every page, ignoring case", async () => {
    const decoys = Array.from({ length: 50 }, (_, index) => ({
      id: `project-${index + 1}`,
      name: `Decoy ${index + 1}`,
      progress: 0,
      status: { name: "Backlog" },
    }))
    const fake = makeFakeLinear({
      teams: [],
      labels: [],
      projects: [...decoys, { ...trashed, id: "project-51" }],
    })
    const found = await run(fake.handler, resolveTrashedProject("tracker"))
    expect(found.id).toBe("project-51")
    const pages = fake.requests.filter((request) => request.query.includes("query Projects"))
    expect(pages.map((request) => request.variables)).toEqual([
      { first: 50, after: null, includeArchived: true },
      { first: 50, after: "project-50", includeArchived: true },
    ])
  })
})

describe("ProjectService.restore", () => {
  test("sends the resolved id and returns the id and name", async () => {
    const fake = makeFakeLinear({ teams: [], labels: [], projects: [trashed] })
    const restored = await run(
      fake.handler,
      Effect.gen(function* restoreProject() {
        const projects = yield* ProjectService
        const project = yield* projects.resolveTrashed("Tracker")
        return yield* projects.restore(project)
      }),
    )
    expect(restored).toEqual({ id: "project-1", name: "Tracker" })
    expect(unarchiveMutation(fake.requests)?.variables).toEqual({ id: "project-1" })
  })

  test("maps a failed payload to a clear error", async () => {
    const fake = makeFakeLinear({ teams: [], labels: [] })
    const missing = { ...trashed, id: "project-404", name: "Missing" }
    const error = await run(
      fake.handler,
      Effect.gen(function* restoreProject() {
        const projects = yield* ProjectService
        return yield* projects.restore(missing)
      }).pipe(Effect.flip),
    )
    expect(error._tag).toBe("ProjectRestoreError")
    expect(error.message).toContain("Missing")
  })
})

describe("project restore", () => {
  test("restores a trashed project by name without a prompt", async () => {
    const fake = makeFakeLinear({ teams: [], labels: [], projects: [trashed] })
    const lines: string[] = []
    await runProject(fake.handler, ["restore", "tracker"], lines)
    expect(lines).toEqual(["Restored Tracker (project-1)."])
    expect(unarchiveMutation(fake.requests)?.variables).toEqual({ id: "project-1" })
  })

  test("restores a trashed project by UUID and prints JSON", async () => {
    const id = "0f8fad5b-d9cb-469f-a165-70867728950e"
    const fake = makeFakeLinear({
      teams: [],
      labels: [],
      projects: [{ ...tracker, id, trashed: true }],
    })
    const lines: string[] = []
    await runProject(fake.handler, ["restore", id, "--json"], lines)
    expect(lastJson(lines)).toEqual({ restored: { id, name: "Tracker" } })
    expect(unarchiveMutation(fake.requests)?.variables).toEqual({ id })
  })

  test("points at project list when no project matches", async () => {
    const fake = makeFakeLinear({ teams: [], labels: [] })
    const lines: string[] = []
    await runProject(fake.handler, ["restore", "Nope"], lines)
    expect(lines).toEqual([
      "error: No project named Nope. Run `rata project list` to see the projects.",
    ])
    expect(process.exitCode).toBe(1)
    expect(unarchiveMutation(fake.requests)).toBeUndefined()
  })

  test("points at project delete when the project is live", async () => {
    const fake = makeFakeLinear({ teams: [], labels: [], projects: [tracker] })
    const lines: string[] = []
    await runProject(fake.handler, ["restore", "Tracker"], lines)
    expect(lines).toEqual([
      "error: The project Tracker (project-1) is not in the trash. Run `rata project delete` to move it there.",
    ])
    expect(process.exitCode).toBe(1)
    expect(unarchiveMutation(fake.requests)).toBeUndefined()
  })

  test("asks for the UUID when several trashed projects share the name", async () => {
    const other = { ...trashed, id: "project-2" }
    const fake = makeFakeLinear({ teams: [], labels: [], projects: [trashed, other] })
    const lines: string[] = []
    await runProject(fake.handler, ["restore", "Tracker"], lines)
    expect(lines).toEqual([
      "error: More than one trashed project is named Tracker. Pass the project UUID instead.",
    ])
    expect(process.exitCode).toBe(1)
    expect(unarchiveMutation(fake.requests)).toBeUndefined()
  })
})
