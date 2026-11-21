import { Result, Schema } from "effect"

import type { RepoConfig } from "@/config/repo/model"

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

const fromLegacyConfig = (config: LegacyRepoConfig): Result.Result<RepoConfig, string> => {
  const { defaultPriority, teamId: storedTeamId, ...rest } = config
  const priority = priorityFromStored(defaultPriority)
  if (Result.isFailure(priority)) {
    return Result.fail(priority.failure)
  }
  return Result.succeed({
    ...rest,
    ...(storedTeamId === undefined ? {} : { teamId: teamId(storedTeamId) }),
    ...(priority.success === null ? {} : { defaultPriority: priority.success }),
  })
}

export { fromLegacyConfig, RepoConfigJson }
