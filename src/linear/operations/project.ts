import { Effect, Schema } from "effect"

import type { ProjectId } from "@/domain/id"
import type { LinearClientShape } from "@/linear/client"
import type { Connection, PageOptions } from "@/linear/connection"
import type { LinearApiError } from "@/linear/errors"

import { pageOrDrain } from "@/linear/connection"
import { Project, ProjectConnection, projectFields } from "@/linear/decode/project"

const listProjectsQuery = `query Projects($first: Int!, $after: String, $includeArchived: Boolean, $filter: ProjectFilter) {
  projects(first: $first, after: $after, orderBy: createdAt, includeArchived: $includeArchived, filter: $filter) {
    nodes {${projectFields}
    }
    pageInfo { hasNextPage endCursor }
  }
}`

const projectByIdQuery = `query ProjectById($id: ID!, $includeArchived: Boolean) {
  projects(first: 1, filter: { id: { eq: $id } }, includeArchived: $includeArchived) {
    nodes {${projectFields}
    }
  }
}`

const ProjectListResponse = Schema.Struct({
  projects: ProjectConnection,
})

const ProjectByIdResponse = Schema.Struct({
  projects: Schema.Struct({
    nodes: Schema.Array(Project),
  }),
})

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
        ProjectListResponse,
      ).pipe(Effect.map((data) => data.projects))
    return yield* pageOrDrain(fetchPage, options)
  })

  const byId = Effect.fn("LinearProject.byId")(function* projectById(id: ProjectId) {
    const data = yield* execute(
      projectByIdQuery,
      { id, includeArchived: true },
      ProjectByIdResponse,
    )
    return data.projects.nodes[0]
  })

  return { byId, list }
}

export { makeProjectOperations, type ProjectListOptions, type ProjectReadOperations }
