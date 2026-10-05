import { Context, Effect, Layer, Schema } from "effect"

import type { LinearApiError } from "@/api/errors"

import { LinearClient } from "@/api/client"

const ProjectStatus = Schema.Struct({ name: Schema.String })

const Project = Schema.Struct({
  id: Schema.String,
  name: Schema.String,
  status: ProjectStatus,
})

type Project = typeof Project.Type

const ProjectConnection = Schema.Struct({ nodes: Schema.Array(Project) })

const listProjectsQuery = `query Projects {
  projects(first: 250) {
    nodes {
      id
      name
      status {
        name
      }
    }
  }
}`

type ProjectServiceShape = {
  readonly list: Effect.Effect<readonly Project[], LinearApiError>
}

class ProjectService extends Context.Service<ProjectService, ProjectServiceShape>()(
  "rata-cli/api/project/ProjectService",
) {
  static readonly layer = Layer.effect(
    ProjectService,
    Effect.gen(function* projectServiceLayer() {
      const client = yield* LinearClient

      const list = client
        .execute(listProjectsQuery, {}, Schema.Struct({ projects: ProjectConnection }))
        .pipe(
          Effect.map((data) => data.projects.nodes),
          Effect.withSpan("ProjectService.list"),
        )

      return ProjectService.of({ list })
    }),
  )
}

export { Project, ProjectService }
