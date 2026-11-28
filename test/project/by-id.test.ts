import type { Handler } from "@test/fake-linear/model"

import { apiLayer } from "@test/fake-linear"
import { jsonResponse } from "@test/fake-linear/model"
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

const recordedHandler: Handler = () => jsonResponse(recordedById)

const resolveByUuid = (ref: string) =>
  Effect.gen(function* resolveProject() {
    const projects = yield* ProjectService
    return yield* projects.resolve(ref)
  })

describe("ProjectService.resolve by UUID", () => {
  test("decodes a recorded response that selects nodes only", async () => {
    const project = await resolveByUuid(id).pipe(
      Effect.provide(apiLayer(recordedHandler)),
      Effect.runPromise,
    )
    expect(project).toEqual({
      id: projectId(id),
      name: "Tracker",
      progress: 0.5,
      status: { name: "Started" },
      trashed: false,
    })
  })
})
