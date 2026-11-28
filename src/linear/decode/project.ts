import { Schema, SchemaGetter } from "effect"

import { ProjectId } from "@/domain/id"

const ProjectStatus = Schema.Struct({ name: Schema.String })

const Trashed = Schema.NullOr(Schema.Boolean).pipe(
  Schema.decodeTo(Schema.Boolean, {
    decode: SchemaGetter.transform((value) => value === true),
    encode: SchemaGetter.transform((value) => value),
  }),
)

const Project = Schema.Struct({
  id: ProjectId,
  name: Schema.String,
  progress: Schema.Finite,
  status: ProjectStatus,
  trashed: Trashed,
})

type Project = typeof Project.Type

const ProjectCreatePayload = Schema.Struct({
  success: Schema.Boolean,
  project: Schema.NullOr(Project),
})

const ProjectArchivePayload = Schema.Struct({
  success: Schema.Boolean,
  entity: Schema.NullOr(Project),
})

type ProjectCreateOptions = {
  readonly name: string
  readonly description?: string | undefined
  readonly teams?: readonly string[] | undefined
}

type ProjectIdentity = {
  readonly id: ProjectId
  readonly name: string
}

export {
  Project,
  ProjectArchivePayload,
  type ProjectCreateOptions,
  ProjectCreatePayload,
  type ProjectIdentity,
}
