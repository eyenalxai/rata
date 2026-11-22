import { Schema } from "effect"

import { TeamId } from "@/domain/id"
import { PrioritySchema } from "@/domain/priority"

const RepoConfig = Schema.Struct({
  team: Schema.optional(Schema.String),
  teamId: Schema.optional(TeamId),
  project: Schema.optional(Schema.String),
  workspace: Schema.optional(Schema.String),
  defaultAssignee: Schema.optional(Schema.String),
  defaultLabels: Schema.optional(Schema.Array(Schema.String)),
  defaultPriority: Schema.optional(PrioritySchema),
})

type RepoConfig = typeof RepoConfig.Type

export { RepoConfig }
