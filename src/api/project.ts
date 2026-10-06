import { Context, Effect, Layer, Option, Schema, SchemaGetter } from "effect"

import type { LinearApiError } from "@/api/errors"
import type { Connection, PageOptions } from "@/api/pagination"
import type { TeamNotFoundError } from "@/api/team"
import type { RepoConfigError } from "@/config/repo"

import { LinearClient } from "@/api/client"
import { PageInfo } from "@/api/pagination"
import { TeamResolutionError, TeamService } from "@/api/team"
import { currentDirectory, RepoConfigService } from "@/config/repo"
import { isUuid } from "@/domain/ref"

const ProjectStatus = Schema.Struct({ name: Schema.String })

const Trashed = Schema.NullOr(Schema.Boolean).pipe(
  Schema.decodeTo(Schema.Boolean, {
    decode: SchemaGetter.transform((value) => value === true),
    encode: SchemaGetter.transform((value) => value),
  }),
)

const Project = Schema.Struct({
  id: Schema.String,
  name: Schema.String,
  progress: Schema.Finite,
  status: ProjectStatus,
  trashed: Trashed,
})

type Project = typeof Project.Type

const ProjectConnection = Schema.Struct({
  nodes: Schema.Array(Project),
  pageInfo: PageInfo,
})

const ProjectCreatePayload = Schema.Struct({
  success: Schema.Boolean,
  project: Schema.NullOr(Project),
})

const listProjectsQuery = `query Projects($first: Int!, $after: String, $includeArchived: Boolean) {
  projects(first: $first, after: $after, orderBy: createdAt, includeArchived: $includeArchived) {
    nodes {
      id
      name
      progress
      status {
        name
      }
      trashed
    }
    pageInfo { hasNextPage endCursor }
  }
}`

const projectCreateMutation = `mutation ProjectCreate($input: ProjectCreateInput!) {
  projectCreate(input: $input) {
    success
    project {
      id
      name
      progress
      status {
        name
      }
      trashed
    }
  }
}`

class ProjectCreateError extends Schema.TaggedError<ProjectCreateError>()("ProjectCreateError", {
  name: Schema.String,
  message: Schema.String,
}) {}

type ProjectCreateOptions = {
  readonly name: string
  readonly description?: string | undefined
  readonly teams?: readonly string[] | undefined
}

type ProjectListOptions = PageOptions & {
  readonly includeArchived?: boolean
}

type ProjectServiceShape = {
  readonly list: (options: ProjectListOptions) => Effect.Effect<Connection<Project>, LinearApiError>
  readonly create: (
    options: ProjectCreateOptions,
  ) => Effect.Effect<
    Project,
    LinearApiError | ProjectCreateError | RepoConfigError | TeamNotFoundError | TeamResolutionError
  >
}

class ProjectService extends Context.Service<ProjectService, ProjectServiceShape>()(
  "rata-cli/api/project/ProjectService",
) {
  static readonly layer = Layer.effect(
    ProjectService,
    Effect.gen(function* projectServiceLayer() {
      const client = yield* LinearClient
      const teams = yield* TeamService
      const repoConfig = yield* RepoConfigService

      const list = Effect.fn("ProjectService.list")(function* listProjects(
        options: ProjectListOptions,
      ) {
        const data = yield* client.execute(
          listProjectsQuery,
          {
            first: options.limit,
            after: options.after,
            includeArchived: options.includeArchived ?? false,
          },
          Schema.Struct({ projects: ProjectConnection }),
        )
        return data.projects
      })

      const teamIdFor = Effect.fn("ProjectService.teamIdFor")(function* teamIdFor(value: string) {
        if (isUuid(value)) {
          return value
        }
        const team = yield* teams.byKey(value)
        return team.id
      })

      const create = Effect.fn("ProjectService.create")(function* createProject(
        options: ProjectCreateOptions,
      ) {
        const config = Option.getOrUndefined(yield* repoConfig.read(yield* currentDirectory))
        const requested =
          options.teams !== undefined && options.teams.length > 0
            ? options.teams
            : config?.team === undefined
              ? []
              : [config.team]
        if (requested.length === 0) {
          return yield* new TeamResolutionError({
            message: "No team. Pass --team, or run `rata link`.",
          })
        }
        const teamIds = yield* Effect.forEach(requested, (team) => teamIdFor(team))
        const input: Record<string, unknown> = { name: options.name, teamIds }
        if (options.description !== undefined) {
          input.description = options.description
        }
        const data = yield* client.execute(
          projectCreateMutation,
          { input },
          Schema.Struct({ projectCreate: ProjectCreatePayload }),
        )
        if (!data.projectCreate.success || data.projectCreate.project === null) {
          return yield* new ProjectCreateError({
            name: options.name,
            message: `Linear did not create the project ${options.name}.`,
          })
        }
        return data.projectCreate.project
      })

      return ProjectService.of({ create, list })
    }),
  )
}

export { Project, ProjectCreateError, type ProjectCreateOptions, ProjectService }
