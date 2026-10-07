import { Schema, SchemaGetter } from "effect"

import type { PageOptions } from "@/api/pagination"

import { PageInfo } from "@/api/pagination"

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

type ProjectCreateOptions = {
  readonly name: string
  readonly description?: string | undefined
  readonly teams?: readonly string[] | undefined
}

type ProjectListOptions = PageOptions & {
  readonly includeArchived?: boolean
  readonly team?: string | undefined
}

type ProjectIdentity = {
  readonly id: string
  readonly name: string
}

export {
  Project,
  ProjectArchivePayload,
  ProjectConnection,
  ProjectCreatePayload,
  type ProjectCreateOptions,
  type ProjectIdentity,
  type ProjectListOptions,
}
