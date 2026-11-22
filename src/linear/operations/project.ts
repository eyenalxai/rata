import { Effect, Schema } from "effect"

import type { ProjectId } from "@/domain/id"
import type { LinearClientShape } from "@/linear/client"
import type { Connection, PageOptions } from "@/linear/connection"
import type { Project } from "@/linear/decode/project"
import type { LinearApiError } from "@/linear/errors"

import { pageOrDrain } from "@/linear/connection"
import { ProjectConnection } from "@/linear/decode/project"
import { listProjectsQuery, projectByIdQuery } from "@/linear/documents/project"

type ProjectListOptions = PageOptions & {
  readonly includeArchived?: boolean
  readonly teamId?: string | undefined
}

type ProjectReadOperations = {
  readonly list: (options: ProjectListOptions) => Effect.Effect<Connection<Project>, LinearApiError>
  readonly byId: (id: ProjectId) => Effect.Effect<Project | undefined, LinearApiError>
}

const makeProjectOperations = (execute: LinearClientShape["execute"]): ProjectReadOperations => {
  const list = Effect.fn("LinearProject.list")(function* listProjects(options: ProjectListOptions) {
    const variables: Record<string, unknown> = {
      includeArchived: options.includeArchived ?? false,
    }
    if (options.teamId !== undefined) {
      variables.filter = { accessibleTeams: { some: { id: { eq: options.teamId } } } }
    }
    const fetchPage = (after: string | null) =>
      execute(
        listProjectsQuery,
        { ...variables, first: options.limit, after },
        Schema.Struct({ projects: ProjectConnection }),
      ).pipe(Effect.map((data) => data.projects))
    return yield* pageOrDrain(fetchPage, options)
  })

  const byId = Effect.fn("LinearProject.byId")(function* projectById(id: ProjectId) {
    const data = yield* execute(
      projectByIdQuery,
      { id, includeArchived: true },
      Schema.Struct({ projects: ProjectConnection }),
    )
    return data.projects.nodes[0]
  })

  return { byId, list }
}

export { makeProjectOperations, type ProjectListOptions, type ProjectReadOperations }
