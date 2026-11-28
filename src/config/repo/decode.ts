import { Option, Result, Schema } from "effect"

import type { RepoConfig } from "@/config/repo/model"
import type { TeamId } from "@/domain/id"

import { UuidTeamId } from "@/domain/id"
import { priorityFromStored } from "@/domain/priority"

const DefaultLabelsJson = Schema.fromJsonString(Schema.Array(Schema.String))

type StoredRepository = Readonly<Record<string, unknown>>

type RepoConfigDecodeError = {
  readonly message: string
  readonly cause?: unknown
}

const decodeStringField = (
  field: string,
  value: unknown,
): Result.Result<string | null, RepoConfigDecodeError> => {
  if (value === null || value === undefined) {
    return Result.succeed(null)
  }
  const decoded = Schema.decodeUnknownResult(Schema.String)(value)
  if (Result.isFailure(decoded)) {
    return Result.fail({
      message: `The stored ${field} of the repository config is not a string.`,
      cause: decoded.failure,
    })
  }
  return Result.succeed(decoded.success)
}

const decodeTeamId = (value: unknown): Result.Result<TeamId | null, RepoConfigDecodeError> => {
  if (value === null || value === undefined) {
    return Result.succeed(null)
  }
  const decoded = Schema.decodeUnknownResult(UuidTeamId)(value)
  if (Result.isFailure(decoded)) {
    return Result.fail({
      message: "The stored team id of the repository config is not a UUID.",
      cause: decoded.failure,
    })
  }
  return Result.succeed(decoded.success)
}

const storedLabels = (
  value: unknown,
): Result.Result<Option.Option<readonly string[]>, RepoConfigDecodeError> => {
  if (value === null || value === undefined) {
    return Result.succeed(Option.none())
  }
  const text = Schema.decodeUnknownResult(Schema.String)(value)
  if (Result.isFailure(text)) {
    return Result.fail({
      message: "The stored default labels of the repository config are not valid JSON.",
      cause: text.failure,
    })
  }
  if (text.success.trim().length === 0) {
    return Result.succeed(Option.none())
  }
  const decoded = Schema.decodeResult(DefaultLabelsJson)(text.success)
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
  const team = decodeStringField("team", row.team)
  if (Result.isFailure(team)) {
    return Result.fail(team.failure)
  }
  const teamId = decodeTeamId(row.teamId)
  if (Result.isFailure(teamId)) {
    return Result.fail(teamId.failure)
  }
  const project = decodeStringField("project", row.project)
  if (Result.isFailure(project)) {
    return Result.fail(project.failure)
  }
  const workspace = decodeStringField("workspace", row.workspace)
  if (Result.isFailure(workspace)) {
    return Result.fail(workspace.failure)
  }
  const defaultAssignee = decodeStringField("defaultAssignee", row.defaultAssignee)
  if (Result.isFailure(defaultAssignee)) {
    return Result.fail(defaultAssignee.failure)
  }
  const labels = storedLabels(row.defaultLabels)
  if (Result.isFailure(labels)) {
    return Result.fail(labels.failure)
  }
  const priorityValue = Schema.decodeUnknownResult(Schema.NullOr(Schema.Int))(
    row.defaultPriority ?? null,
  )
  if (Result.isFailure(priorityValue)) {
    return Result.fail({
      message: "The stored default priority of the repository config is not valid.",
      cause: priorityValue.failure,
    })
  }
  const priority = priorityFromStored(priorityValue.success)
  if (Result.isFailure(priority)) {
    return Result.fail({
      message: "The stored default priority of the repository config is not valid.",
      cause: priority.failure,
    })
  }
  return Result.succeed({
    ...(team.success === null ? {} : { team: team.success }),
    ...(teamId.success === null ? {} : { teamId: teamId.success }),
    ...(project.success === null ? {} : { project: project.success }),
    ...(workspace.success === null ? {} : { workspace: workspace.success }),
    ...(defaultAssignee.success === null ? {} : { defaultAssignee: defaultAssignee.success }),
    ...(Option.isNone(labels.success) ? {} : { defaultLabels: labels.success.value }),
    ...(priority.success === null ? {} : { defaultPriority: priority.success }),
  })
}

export { DefaultLabelsJson, decodeStoredRepository }
