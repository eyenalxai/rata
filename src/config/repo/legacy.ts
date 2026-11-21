import { Schema } from "effect"

import type { RepoConfig } from "@/config/repo"

import { teamId } from "@/domain/id"
import { priorityFromStored } from "@/domain/priority"

const LegacyRepoConfig = Schema.Struct({
  team: Schema.optional(Schema.String),
  teamId: Schema.optional(Schema.String),
  project: Schema.optional(Schema.String),
  workspace: Schema.optional(Schema.String),
  defaultAssignee: Schema.optional(Schema.String),
  defaultLabels: Schema.optional(Schema.Array(Schema.String)),
  defaultPriority: Schema.optional(Schema.Int),
})

type LegacyRepoConfig = typeof LegacyRepoConfig.Type

const RepoConfigJson = Schema.fromJsonString(LegacyRepoConfig, { space: 2 })

const fromLegacyConfig = (config: LegacyRepoConfig): RepoConfig => {
  const { defaultPriority, teamId: storedTeamId, ...rest } = config
  const priority = priorityFromStored(defaultPriority)
  return {
    ...rest,
    ...(storedTeamId === undefined ? {} : { teamId: teamId(storedTeamId) }),
    ...(priority === null || priority === "none" ? {} : { defaultPriority: priority }),
  }
}

export { fromLegacyConfig, RepoConfigJson }
