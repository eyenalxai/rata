import { Context, Effect, Layer, Option, Schema } from "effect"

import type { LinearApiError } from "@/api/errors"
import type { TeamNotFoundError } from "@/api/team"
import type { RepoConfigError } from "@/config/repo"

import { LinearClient } from "@/api/client"
import { TeamResolutionError, TeamService } from "@/api/team"
import { RepoConfigService } from "@/config/repo"
import { isUuid } from "@/domain/ref"

const ProjectStatus = Schema.Struct({ name: Schema.String })

const Project = Schema.Struct({
  id: Schema.String,
  name: Schema.String,
  progress: Schema.Finite,
  status: ProjectStatus,
})

type Project = typeof Project.Type

const ProjectConnection = Schema.Struct({ nodes: Schema.Array(Project) })

const ProjectCreatePayload = Schema.Struct({
  success: Schema.Boolean,
  project: Schema.NullOr(Project),
})

const listProjectsQuery = `query Projects {
  projects(first: 250) {
    nodes {
      id
      name
      progress
      status {
        name
      }
    }
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

type ProjectServiceShape = {
  readonly list: Effect.Effect<readonly Project[], LinearApiError>
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

      const list = client
        .execute(listProjectsQuery, {}, Schema.Struct({ projects: ProjectConnection }))
        .pipe(
          Effect.map((data) => data.projects.nodes),
          Effect.withSpan("ProjectService.list"),
        )

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
        const config = Option.getOrUndefined(yield* repoConfig.read)
        const requested =
          options.teams !== undefined && options.teams.length > 0
            ? options.teams
            : config?.team === undefined
              ? []
              : [config.team]
        if (requested.length === 0) {
          return yield* new TeamResolutionError({
            message: "No team. Pass --team, or set the team in .rata.json.",
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
