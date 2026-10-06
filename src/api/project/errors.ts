import { Schema } from "effect"

import type { Project } from "@/api/project/model"

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

class ProjectNotDeletedError extends Schema.TaggedError<ProjectNotDeletedError>()(
  "ProjectNotDeletedError",
  {
    name: Schema.String,
    id: Schema.String,
    message: Schema.String,
  },
) {}

class ProjectRestoreError extends Schema.TaggedError<ProjectRestoreError>()("ProjectRestoreError", {
  name: Schema.String,
  message: Schema.String,
}) {}

const alreadyDeleted = (project: Project): ProjectAlreadyDeletedError =>
  new ProjectAlreadyDeletedError({
    name: project.name,
    id: project.id,
    message: `The project ${project.name} (${project.id}) is in the trash. Run \`rata project restore\` to bring it back.`,
  })

const notDeleted = (project: Project): ProjectNotDeletedError =>
  new ProjectNotDeletedError({
    name: project.name,
    id: project.id,
    message: `The project ${project.name} (${project.id}) is not in the trash. Run \`rata project delete\` to move it there.`,
  })

export {
  alreadyDeleted,
  notDeleted,
  ProjectAlreadyDeletedError,
  ProjectCreateError,
  ProjectDeleteError,
  ProjectNameAmbiguousError,
  ProjectNotFoundError,
  ProjectNotDeletedError,
  ProjectRestoreError,
}
