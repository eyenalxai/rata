import { Schema } from "effect"

import type { Project } from "@/linear/decode/project"

import { ProjectId } from "@/domain/id"

class ProjectCreateError extends Schema.TaggedError<ProjectCreateError>()("ProjectCreateError", {
  code: Schema.tag("internal"),
  name: Schema.String,
  message: Schema.String,
}) {}

class ProjectNotFoundError extends Schema.TaggedError<ProjectNotFoundError>()(
  "ProjectNotFoundError",
  {
    code: Schema.tag("not_found"),
    ref: Schema.String,
    message: Schema.String,
  },
) {}

class ProjectAlreadyDeletedError extends Schema.TaggedError<ProjectAlreadyDeletedError>()(
  "ProjectAlreadyDeletedError",
  {
    code: Schema.tag("conflict"),
    name: Schema.String,
    id: ProjectId,
    message: Schema.String,
  },
) {}

class ProjectNameAmbiguousError extends Schema.TaggedError<ProjectNameAmbiguousError>()(
  "ProjectNameAmbiguousError",
  {
    code: Schema.tag("ambiguous"),
    name: Schema.String,
    message: Schema.String,
  },
) {}

class ProjectDeleteError extends Schema.TaggedError<ProjectDeleteError>()("ProjectDeleteError", {
  code: Schema.tag("internal"),
  name: Schema.String,
  message: Schema.String,
}) {}

class ProjectNotDeletedError extends Schema.TaggedError<ProjectNotDeletedError>()(
  "ProjectNotDeletedError",
  {
    code: Schema.tag("conflict"),
    name: Schema.String,
    id: ProjectId,
    message: Schema.String,
  },
) {}

class ProjectRestoreError extends Schema.TaggedError<ProjectRestoreError>()("ProjectRestoreError", {
  code: Schema.tag("internal"),
  name: Schema.String,
  message: Schema.String,
}) {}

const alreadyDeletedError = (project: Project): ProjectAlreadyDeletedError =>
  new ProjectAlreadyDeletedError({
    name: project.name,
    id: project.id,
    message: `The project ${project.name} (${project.id}) is in the trash. Run \`rata admin project restore\` to bring it back.`,
  })

const notDeletedError = (project: Project): ProjectNotDeletedError =>
  new ProjectNotDeletedError({
    name: project.name,
    id: project.id,
    message: `The project ${project.name} (${project.id}) is not in the trash. Run \`rata admin project delete\` to move it there.`,
  })

export {
  alreadyDeletedError,
  notDeletedError,
  ProjectAlreadyDeletedError,
  ProjectCreateError,
  ProjectDeleteError,
  ProjectNameAmbiguousError,
  ProjectNotFoundError,
  ProjectNotDeletedError,
  ProjectRestoreError,
}
