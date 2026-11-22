import type { MemorySeed } from "@test/fake-linear/gateway/model"

import { memoryApiLayer } from "@test/fake-linear/memory-layer"
import { defaultViewer } from "@test/fake-linear/model"
import { describe, expect, test } from "bun:test"
import { Effect, Option, Schema } from "effect"

import { ProjectService } from "@/api/project"
import { projectId } from "@/domain/id"
import { Viewer } from "@/linear/decode/viewer"

const memoryViewer = Option.getOrThrow(Schema.decodeUnknownOption(Viewer)(defaultViewer))

const memorySeed = (
  projects: readonly {
    readonly id: ReturnType<typeof projectId>
    readonly name: string
    readonly progress: number
    readonly status: { readonly name: string }
    readonly trashed?: boolean
  }[],
): MemorySeed => ({
  viewer: memoryViewer,
  teams: [],
  labels: [],
  projects: projects.map((project) => ({ ...project, trashed: project.trashed ?? false })),
})

const runMemory = <A, E>(
  projects: Parameters<typeof memorySeed>[0],
  effect: Effect.Effect<A, E, ProjectService>,
) => effect.pipe(Effect.provide(memoryApiLayer(memorySeed(projects))), Effect.runPromise)

const resolveProject = (ref: string) =>
  Effect.gen(function* resolve() {
    const projects = yield* ProjectService
    return yield* projects.resolve(ref)
  })

describe("ProjectService.list", () => {
  test("passes includeArchived and decodes the trashed flag", async () => {
    const projects = [
      { id: projectId("project-1"), name: "Tracker", progress: 0.5, status: { name: "Started" } },
      {
        id: projectId("project-2"),
        name: "Login",
        progress: 0,
        status: { name: "Backlog" },
        trashed: true,
      },
    ]
    const page = await runMemory(
      projects,
      Effect.gen(function* listProjects() {
        const service = yield* ProjectService
        return yield* service.list({ after: null, limit: 50, includeArchived: true })
      }),
    )
    expect(page.nodes).toEqual([
      {
        id: projectId("project-1"),
        name: "Tracker",
        progress: 0.5,
        status: { name: "Started" },
        trashed: false,
      },
      {
        id: projectId("project-2"),
        name: "Login",
        progress: 0,
        status: { name: "Backlog" },
        trashed: true,
      },
    ])
  })
})

describe("ProjectService.resolve", () => {
  test("reads a project by UUID", async () => {
    const id = "0f8fad5b-d9cb-469f-a165-70867728950e"
    const tracker = {
      id: projectId(id),
      name: "Tracker",
      progress: 0.5,
      status: { name: "Started" },
    }
    const found = await runMemory(
      [tracker],
      Effect.gen(function* resolve() {
        const service = yield* ProjectService
        return yield* service.resolve(id)
      }),
    )
    expect(found).toEqual({ ...tracker, trashed: false })
  })

  test("fails with the project list hint when no project matches the UUID", async () => {
    const id = "0f8fad5b-d9cb-469f-a165-70867728950e"
    const error = await runMemory([], resolveProject(id).pipe(Effect.flip))
    expect(error._tag).toBe("ProjectNotFoundError")
    expect(error.message).toContain("project list")
  })

  test("fails when no project matches the name", async () => {
    const error = await runMemory([], resolveProject("Nope").pipe(Effect.flip))
    expect(error._tag).toBe("ProjectNotFoundError")
    expect(error.message).toContain("project list")
  })

  test("fails when a UUID names a trashed project", async () => {
    const id = "0f8fad5b-d9cb-469f-a165-70867728950e"
    const trashed = {
      id: projectId(id),
      name: "Tracker",
      progress: 0,
      status: { name: "Backlog" },
      trashed: true,
    }
    const error = await runMemory([trashed], resolveProject(id).pipe(Effect.flip))
    expect(error._tag).toBe("ProjectAlreadyDeletedError")
    expect(error.message).toContain("project restore")
  })

  test("fails when several live projects share the name", async () => {
    const first = {
      id: projectId("project-1"),
      name: "Tracker",
      progress: 0.5,
      status: { name: "Started" },
    }
    const second = {
      id: projectId("project-2"),
      name: "tracker",
      progress: 0,
      status: { name: "Backlog" },
    }
    const error = await runMemory([first, second], resolveProject("Tracker").pipe(Effect.flip))
    expect(error._tag).toBe("ProjectNameAmbiguousError")
    expect(error.message).toContain("UUID")
  })

  test("fails when every match is in the trash", async () => {
    const trashed = {
      id: projectId("project-1"),
      name: "Tracker",
      progress: 0,
      status: { name: "Backlog" },
      trashed: true,
    }
    const error = await runMemory([trashed], resolveProject("tracker").pipe(Effect.flip))
    expect(error._tag).toBe("ProjectAlreadyDeletedError")
    expect(error.message).toContain("project restore")
  })

  test("prefers a live project over a trashed one", async () => {
    const live = {
      id: projectId("project-1"),
      name: "Tracker",
      progress: 0.5,
      status: { name: "Started" },
    }
    const trashed = {
      id: projectId("project-2"),
      name: "Tracker",
      progress: 0,
      status: { name: "Backlog" },
      trashed: true,
    }
    const found = await runMemory([trashed, live], resolveProject("Tracker"))
    expect(String(found.id)).toBe("project-1")
  })

  test("finds a project by name across every page, ignoring case", async () => {
    const decoys = Array.from({ length: 50 }, (_, index) => ({
      id: projectId(`project-${index + 1}`),
      name: `Decoy ${index + 1}`,
      progress: 0,
      status: { name: "Backlog" },
    }))
    const tracker = {
      id: projectId("project-51"),
      name: "Tracker",
      progress: 0.5,
      status: { name: "Started" },
    }
    const found = await runMemory(
      [...decoys, tracker],
      Effect.gen(function* resolve() {
        const service = yield* ProjectService
        return yield* service.resolve("tracker")
      }),
    )
    expect(found).toEqual({ ...tracker, trashed: false })
  })
})
