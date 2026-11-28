import { Schema, SchemaGetter } from "effect"

import { ProjectId } from "@/domain/id"
import { PageInfo } from "@/linear/decode/page"

const projectFields = `
      id
      name
      progress
      status {
        name
      }
      trashed`

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
  ProjectConnection,
  type ProjectCreateOptions,
  ProjectCreatePayload,
  projectFields,
  type ProjectIdentity,
}
