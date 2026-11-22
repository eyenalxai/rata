import { Schema } from "effect"

import { UserId, WorkspaceId } from "@/domain/id"

const Viewer = Schema.Struct({
  id: UserId,
  name: Schema.String,
  displayName: Schema.String,
  email: Schema.String,
  active: Schema.Boolean,
  admin: Schema.Boolean,
  organization: Schema.Struct({
    id: WorkspaceId,
    name: Schema.String,
    urlKey: Schema.String,
  }),
})

type Viewer = typeof Viewer.Type

export { Viewer }
