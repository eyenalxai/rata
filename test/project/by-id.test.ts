import type { Handler } from "@test/fake-linear/model"

import { apiLayer } from "@test/fake-linear"
import { jsonResponse, readRequest } from "@test/fake-linear/model"
import { describe, expect, test } from "bun:test"
import { Effect } from "effect"

import { ProjectService } from "@/api/project"
import { projectId } from "@/domain/id"

const id = "0f8fad5b-d9cb-469f-a165-70867728950e"

const recordedById = {
  data: {
    projects: {
      nodes: [
        {
          id,
          name: "Tracker",
          progress: 0.5,
          status: { name: "Started" },
          trashed: false,
        },
      ],
    },
  },
}

let query = ""

const recordedHandler: Handler = (request) => {
  query = readRequest(request).query
  return jsonResponse(recordedById)
}

describe("ProjectService.resolve by UUID", () => {
  test("decodes a recorded response that selects nodes only", async () => {
    const project = await Effect.gen(function* resolveProject() {
      const projects = yield* ProjectService
      return yield* projects.resolve(id)
    }).pipe(Effect.provide(apiLayer(recordedHandler)), Effect.runPromise)
    expect(project).toEqual({
      id: projectId(id),
      name: "Tracker",
      progress: 0.5,
      status: { name: "Started" },
      trashed: false,
    })
    expect(query).toContain("query ProjectById")
    expect(query).not.toContain("pageInfo")
  })
})
