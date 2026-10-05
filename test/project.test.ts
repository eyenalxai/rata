import type { Handler } from "@test/fake-linear"

import { apiLayer, makeFakeLinear } from "@test/fake-linear"
import { describe, expect, test } from "bun:test"
import { Effect } from "effect"

import { ProjectService } from "@/api/project"

const project = { id: "project-1", name: "rata", status: { name: "In Progress" } }

const listProjects = (handler: Handler) =>
  Effect.gen(function* runList() {
    const projects = yield* ProjectService
    return yield* projects.list
  }).pipe(Effect.provide(apiLayer(handler)))

describe("ProjectService", () => {
  test("lists projects with id, name and status", async () => {
    const fake = makeFakeLinear({ teams: [], projects: [project], labels: [] })
    const projects = await listProjects(fake.handler).pipe(Effect.runPromise)
    expect(projects).toEqual([project])
    expect(fake.requests[0]?.query).toContain("projects(")
  })
})
