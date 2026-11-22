import { Context, Effect, Layer, Schema } from "effect"

import type { ProjectAlreadyDeletedError, ProjectNotDeletedError } from "@/api/project/errors"
import type { TeamNotFoundError, TeamResolutionError } from "@/api/team"
import type { RepoConfigError } from "@/config/repo"
import type { ProjectId } from "@/domain/id"
import type { Connection } from "@/linear/connection"
import type { Project, ProjectCreateOptions, ProjectIdentity } from "@/linear/decode/project"
import type { LinearApiError } from "@/linear/errors"
import type { ProjectListOptions } from "@/linear/operations/project"

import {
  alreadyDeletedError,
  notDeletedError,
  ProjectCreateError,
  ProjectDeleteError,
  ProjectNameAmbiguousError,
  ProjectNotFoundError,
  ProjectRestoreError,
} from "@/api/project/errors"
import { RepoTeam } from "@/api/repo-team"
import { isUuid, projectId } from "@/domain/id"
import { collectConnection, pageSize } from "@/linear/connection"
import { ProjectArchivePayload, ProjectCreatePayload } from "@/linear/decode/project"
import {
  projectCreateMutation,
  projectDeleteMutation,
  projectUnarchiveMutation,
} from "@/linear/documents/project"
import { LinearGateway } from "@/linear/gateway"

const unwrapProjectArchive = <E>(
  payload: { readonly success: boolean; readonly entity: Project | null },
  failure: () => E,
): Effect.Effect<ProjectIdentity, E> =>
  payload.success && payload.entity !== null
    ? Effect.succeed({ id: payload.entity.id, name: payload.entity.name })
    : Effect.fail(failure())

type ProjectServiceShape = {
  readonly list: (options: ProjectListOptions) => Effect.Effect<Connection<Project>, LinearApiError>
  readonly resolve: (
    ref: string,
  ) => Effect.Effect<
    Project,
    LinearApiError | ProjectNotFoundError | ProjectAlreadyDeletedError | ProjectNameAmbiguousError
  >
  readonly resolveTrashed: (
    ref: string,
  ) => Effect.Effect<
    Project,
    LinearApiError | ProjectNotFoundError | ProjectNotDeletedError | ProjectNameAmbiguousError
  >
  readonly delete: (
    project: Project,
  ) => Effect.Effect<ProjectIdentity, LinearApiError | ProjectDeleteError>
  readonly restore: (
    project: Project,
  ) => Effect.Effect<ProjectIdentity, LinearApiError | ProjectRestoreError>
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
      const gateway = yield* LinearGateway
      const repoTeam = yield* RepoTeam

      const list = Effect.fn("ProjectService.list")(function* listProjects(
        options: ProjectListOptions,
      ) {
        return yield* gateway.project.list(options)
      })

      const projectById = Effect.fn("ProjectService.projectById")(function* projectById(
        id: ProjectId,
      ) {
        return yield* gateway.project.byId(id)
      })

      const allByName = Effect.fn("ProjectService.allByName")(function* allByName(name: string) {
        const all = yield* collectConnection((after) =>
          list({ after, limit: pageSize, includeArchived: true }),
        )
        return all.filter((project) => project.name.toLowerCase() === name.toLowerCase())
      })

      const resolveProject = Effect.fn("ProjectService.resolveProject")(function* resolveProject<E>(
        ref: string,
        state: "live" | "trashed",
        wrongState: (project: Project) => E,
      ): Effect.fn.Return<
        Project,
        LinearApiError | ProjectNotFoundError | ProjectNameAmbiguousError | E
      > {
        const wantTrashed = state === "trashed"
        if (isUuid(ref)) {
          const project = yield* projectById(projectId(ref))
          if (project === undefined) {
            return yield* new ProjectNotFoundError({
              ref,
              message: `No project with id ${ref}. Run \`rata project list\` to see the projects.`,
            })
          }
          if (project.trashed !== wantTrashed) {
            return yield* Effect.fail(wrongState(project))
          }
          return project
        }
        const matches = yield* allByName(ref)
        const wanted = matches.filter((project) => project.trashed === wantTrashed)
        if (wanted.length > 1) {
          return yield* new ProjectNameAmbiguousError({
            name: ref,
            message: `More than one ${state} project is named ${ref}. Pass the project UUID instead.`,
          })
        }
        const match = wanted[0]
        if (match === undefined) {
          const other = matches[0]
          if (other !== undefined) {
            return yield* Effect.fail(wrongState(other))
          }
          return yield* new ProjectNotFoundError({
            ref,
            message: `No project named ${ref}. Run \`rata project list\` to see the projects.`,
          })
        }
        return match
      })

      const resolve = Effect.fn("ProjectService.resolve")(function* resolveLive(ref: string) {
        return yield* resolveProject(ref, "live", alreadyDeletedError)
      })

      const resolveTrashed = Effect.fn("ProjectService.resolveTrashed")(
        function* resolveTrashedProject(ref: string) {
          return yield* resolveProject(ref, "trashed", notDeletedError)
        },
      )

      const deleteProject = Effect.fn("ProjectService.delete")(function* deleteProject(
        project: Project,
      ) {
        const data = yield* gateway.client.execute(
          projectDeleteMutation,
          { id: project.id },
          Schema.Struct({ projectDelete: ProjectArchivePayload }),
        )
        return yield* unwrapProjectArchive(
          data.projectDelete,
          () =>
            new ProjectDeleteError({
              name: project.name,
              message: `Linear did not delete the project ${project.name}.`,
            }),
        )
      })

      const restoreProject = Effect.fn("ProjectService.restore")(function* restoreProject(
        project: Project,
      ) {
        const data = yield* gateway.client.execute(
          projectUnarchiveMutation,
          { id: project.id },
          Schema.Struct({ projectUnarchive: ProjectArchivePayload }),
        )
        return yield* unwrapProjectArchive(
          data.projectUnarchive,
          () =>
            new ProjectRestoreError({
              name: project.name,
              message: `Linear did not restore the project ${project.name}.`,
            }),
        )
      })

      const create = Effect.fn("ProjectService.create")(function* createProject(
        options: ProjectCreateOptions,
      ) {
        const requested =
          options.teams !== undefined && options.teams.length > 0 ? options.teams : []
        const teamIds =
          requested.length > 0
            ? yield* Effect.forEach(requested, (team) => repoTeam.resolve(team))
            : [yield* repoTeam.resolve()]
        const input: Record<string, unknown> = { name: options.name, teamIds }
        if (options.description !== undefined) {
          input.description = options.description
        }
        const data = yield* gateway.client.execute(
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

      return ProjectService.of({
        create,
        delete: deleteProject,
        list,
        resolve,
        resolveTrashed,
        restore: restoreProject,
      })
    }),
  )
}

export { ProjectService }
