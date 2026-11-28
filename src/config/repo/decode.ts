import { Option, Result, Schema } from "effect"

import type { RepoConfig } from "@/config/repo/model"
import type { repositories } from "@/db/schema"

import { uuidPattern } from "@/domain/id"
import { priorityFromStored } from "@/domain/priority"

const DefaultLabelsJson = Schema.fromJsonString(Schema.Array(Schema.String))

const StoredTeamId = Schema.String.check(
  Schema.isPattern(uuidPattern, { message: "The team id must be a UUID." }),
).pipe(Schema.brand("TeamId"))

const StoredRepositoryConfig = Schema.Struct({
  team: Schema.NullOr(Schema.String),
  teamId: Schema.NullOr(StoredTeamId),
  project: Schema.NullOr(Schema.String),
  workspace: Schema.NullOr(Schema.String),
  defaultAssignee: Schema.NullOr(Schema.String),
  defaultLabels: Schema.NullOr(Schema.String),
  defaultPriority: Schema.NullOr(Schema.Int),
})

type StoredRepository = typeof repositories.$inferSelect

type RepoConfigDecodeError = {
  readonly message: string
  readonly cause?: unknown
}

const storedLabels = (
  value: string | null,
): Result.Result<Option.Option<readonly string[]>, RepoConfigDecodeError> => {
  if (value === null || value.trim().length === 0) {
    return Result.succeed(Option.none())
  }
  const decoded = Schema.decodeResult(DefaultLabelsJson)(value)
  if (Result.isFailure(decoded)) {
    return Result.fail({
      message: "The stored default labels of the repository config are not valid JSON.",
      cause: decoded.failure,
    })
  }
  return Result.succeed(decoded.success.length === 0 ? Option.none() : Option.some(decoded.success))
}

const decodeStoredRepository = (
  row: StoredRepository,
): Result.Result<RepoConfig, RepoConfigDecodeError> => {
  const decoded = Schema.decodeResult(StoredRepositoryConfig)(row)
  if (Result.isFailure(decoded)) {
    return Result.fail({
      message: "The stored team id of the repository config is not a UUID.",
      cause: decoded.failure,
    })
  }
  const stored = decoded.success
  const labels = storedLabels(stored.defaultLabels)
  if (Result.isFailure(labels)) {
    return Result.fail(labels.failure)
  }
  const priority = priorityFromStored(stored.defaultPriority)
  if (Result.isFailure(priority)) {
    return Result.fail({
      message: "The stored default priority of the repository config is not valid.",
      cause: priority.failure,
    })
  }
  return Result.succeed({
    ...(stored.team === null ? {} : { team: stored.team }),
    ...(stored.teamId === null ? {} : { teamId: stored.teamId }),
    ...(stored.project === null ? {} : { project: stored.project }),
    ...(stored.workspace === null ? {} : { workspace: stored.workspace }),
    ...(stored.defaultAssignee === null ? {} : { defaultAssignee: stored.defaultAssignee }),
    ...(Option.isNone(labels.success) ? {} : { defaultLabels: labels.success.value }),
    ...(priority.success === null ? {} : { defaultPriority: priority.success }),
  })
}

export { DefaultLabelsJson, decodeStoredRepository }
