import { Context, Effect, Layer, Option, Schema, SchemaGetter } from "effect"

import type { LinearApiError } from "@/api/errors"
import type { Connection, PageOptions } from "@/api/pagination"
import type { TeamNotFoundError } from "@/api/team"
import type { RepoConfigError } from "@/config/repo"

import { LinearClient } from "@/api/client"
import { collectConnection, PageInfo, pageSize } from "@/api/pagination"
import {
  listProjectsQuery,
  projectByIdQuery,
  projectCreateMutation,
  projectDeleteMutation,
} from "@/api/project/query"
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

const ProjectArchivePayload = Schema.Struct({
  success: Schema.Boolean,
  entity: Schema.NullOr(Project),
})

class ProjectCreateError extends Schema.TaggedError<ProjectCreateError>()("ProjectCreateError", {
  name: Schema.String,
  message: Schema.String,
}) {}

class ProjectNotFoundError extends Schema.TaggedError<ProjectNotFoundError>()(
  "ProjectNotFoundError",
  {
    ref: Schema.String,
    message: Schema.String,
  },
) {}

class ProjectAlreadyDeletedError extends Schema.TaggedError<ProjectAlreadyDeletedError>()(
  "ProjectAlreadyDeletedError",
  {
    name: Schema.String,
    id: Schema.String,
    message: Schema.String,
  },
) {}

class ProjectNameAmbiguousError extends Schema.TaggedError<ProjectNameAmbiguousError>()(
  "ProjectNameAmbiguousError",
  {
    name: Schema.String,
    message: Schema.String,
  },
) {}

class ProjectDeleteError extends Schema.TaggedError<ProjectDeleteError>()("ProjectDeleteError", {
  name: Schema.String,
  message: Schema.String,
}) {}

const alreadyDeleted = (project: Project): ProjectAlreadyDeletedError =>
  new ProjectAlreadyDeletedError({
    name: project.name,
    id: project.id,
    message: `The project ${project.name} (${project.id}) is in the trash. Run \`rata project restore\` to bring it back.`,
  })

type ProjectCreateOptions = {
  readonly name: string
  readonly description?: string | undefined
  readonly teams?: readonly string[] | undefined
}

type ProjectListOptions = PageOptions & {
  readonly includeArchived?: boolean
}

type DeletedProject = {
  readonly id: string
  readonly name: string
}

type ProjectServiceShape = {
  readonly list: (options: ProjectListOptions) => Effect.Effect<Connection<Project>, LinearApiError>
  readonly resolve: (
    ref: string,
  ) => Effect.Effect<
    Project,
    LinearApiError | ProjectNotFoundError | ProjectAlreadyDeletedError | ProjectNameAmbiguousError
  >
  readonly delete: (
    project: Project,
  ) => Effect.Effect<DeletedProject, LinearApiError | ProjectDeleteError>
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

      const projectById = Effect.fn("ProjectService.projectById")(function* projectById(
        id: string,
      ) {
        const data = yield* client.execute(
          projectByIdQuery,
          { id },
          Schema.Struct({ project: Project }),
        )
        return data.project
      })

      const allByName = Effect.fn("ProjectService.allByName")(function* allByName(name: string) {
        const all = yield* collectConnection((after) =>
          list({ after, limit: pageSize, includeArchived: true }),
        )
        return all.filter((project) => project.name.toLowerCase() === name.toLowerCase())
      })

      const resolve = Effect.fn("ProjectService.resolve")(function* resolveProject(ref: string) {
        if (isUuid(ref)) {
          const project = yield* projectById(ref)
          if (project.trashed) {
            return yield* alreadyDeleted(project)
          }
          return project
        }
        const matches = yield* allByName(ref)
        const live = matches.filter((project) => !project.trashed)
        if (live.length > 1) {
          return yield* new ProjectNameAmbiguousError({
            name: ref,
            message: `More than one live project is named ${ref}. Pass the project UUID instead.`,
          })
        }
        const match = live[0]
        if (match === undefined) {
          const deleted = matches[0]
          if (deleted !== undefined) {
            return yield* alreadyDeleted(deleted)
          }
          return yield* new ProjectNotFoundError({
            ref,
            message: `No project named ${ref}. Run \`rata project list\` to see the projects.`,
          })
        }
        return match
      })

      const deleteProject = Effect.fn("ProjectService.delete")(function* deleteProject(
        project: Project,
      ) {
        const data = yield* client.execute(
          projectDeleteMutation,
          { id: project.id },
          Schema.Struct({ projectDelete: ProjectArchivePayload }),
        )
        if (!data.projectDelete.success || data.projectDelete.entity === null) {
          return yield* new ProjectDeleteError({
            name: project.name,
            message: `Linear did not delete the project ${project.name}.`,
          })
        }
        return { id: data.projectDelete.entity.id, name: data.projectDelete.entity.name }
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

      return ProjectService.of({ create, delete: deleteProject, list, resolve })
    }),
  )
}

export {
  type DeletedProject,
  Project,
  ProjectAlreadyDeletedError,
  ProjectCreateError,
  type ProjectCreateOptions,
  ProjectDeleteError,
  ProjectNameAmbiguousError,
  ProjectNotFoundError,
  ProjectService,
}
