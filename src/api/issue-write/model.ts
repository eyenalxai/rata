import { Effect, Schema } from "effect"

import type { LinearApiError } from "@/api/errors"
import type { IssueSummary } from "@/api/issue-model"
import type { IssueComment, IssueSummaryNode, WorkflowState } from "@/api/issue-schema"
import type { LabelNotFoundError } from "@/api/label"
import type { ProjectNotFoundError } from "@/api/project/errors"
import type { TeamNotFoundError, TeamResolutionError } from "@/api/team"
import type { RepoConfigError } from "@/config/repo"
import type { SectionLookupError } from "@/domain/body/section/model"
import type { ConflictError } from "@/domain/conflict"
import type { InvalidIssueRef } from "@/domain/ref"

import { toSummary } from "@/api/issue-model"

class IssueWriteError extends Schema.TaggedError<IssueWriteError>()("IssueWriteError", {
  message: Schema.String,
}) {}

class StateNotFoundError extends Schema.TaggedError<StateNotFoundError>()("StateNotFoundError", {
  state: Schema.String,
  teamId: Schema.String,
  message: Schema.String,
}) {}

class CommentNotFoundError extends Schema.TaggedError<CommentNotFoundError>()(
  "CommentNotFoundError",
  {
    id: Schema.String,
    message: Schema.String,
  },
) {}

const relationKinds = ["blocks", "blockedBy", "related", "duplicate"] as const
type RelationKind = (typeof relationKinds)[number]

const writeStatuses = ["updated", "skipped"] as const
type WriteStatus = (typeof writeStatuses)[number]

const writeActionNames = [
  "assign",
  "unassign",
  "close",
  "add-label",
  "remove-label",
  "link",
  "unlink",
] as const
type WriteActionName = (typeof writeActionNames)[number]

type WriteAction = {
  readonly action: WriteActionName
  readonly target: string
  readonly status: WriteStatus
  readonly changes: Record<string, unknown>
}

type WriteOptions = {
  readonly dryRun?: boolean | undefined
}

type BulkTarget = {
  readonly summary: IssueSummary
  readonly teamId: string
}

type ResolvedLabel = {
  readonly id: string
  readonly name: string
}

type BulkWriteSuccess = {
  readonly identifier: string
  readonly status: "updated" | "skipped"
  readonly issue: IssueSummary
  readonly labels?: readonly string[] | undefined
}

type BulkWriteFailure = {
  readonly identifier: string
  readonly status: "failed"
  readonly error: IssueWriteApiError
}

type BulkWriteResult = BulkWriteSuccess | BulkWriteFailure

type IssueWriteResult = {
  readonly status: WriteStatus
  readonly issue: IssueSummary
  readonly actions: readonly WriteAction[]
}

const combineStatus = (actions: readonly { readonly status: WriteStatus }[]): WriteStatus =>
  actions.some((action) => action.status === "updated") ? "updated" : "skipped"

type IssueRelationChanges = {
  readonly blocks: readonly string[]
  readonly blockedBy: readonly string[]
  readonly related: readonly string[]
  readonly duplicate: readonly string[]
}

type IssueRelationChange = {
  readonly action: "created" | "deleted" | "skipped"
  readonly kind: RelationKind
  readonly target: string
}

type RelationType = "blocks" | "related" | "duplicate"

type RelationKindInfo = {
  readonly label: string
  readonly type: RelationType
  readonly inverse: boolean
}

const relationKindInfo: Record<RelationKind, RelationKindInfo> = {
  blocks: { label: "blocks", type: "blocks", inverse: false },
  blockedBy: { label: "blocked by", type: "blocks", inverse: true },
  related: { label: "related to", type: "related", inverse: false },
  duplicate: { label: "duplicates", type: "duplicate", inverse: false },
}

type ResolvedRelationTarget = {
  readonly kind: RelationKind
  readonly target: string
  readonly targetId: string
}

type RelationWriteResult = {
  readonly status: WriteStatus
  readonly changes: readonly IssueRelationChange[]
  readonly actions: readonly WriteAction[]
}

type IssueWriteApiError =
  | CommentNotFoundError
  | InvalidIssueRef
  | IssueWriteError
  | ConflictError
  | LabelNotFoundError
  | LinearApiError
  | ProjectNotFoundError
  | RepoConfigError
  | SectionLookupError
  | StateNotFoundError
  | TeamNotFoundError
  | TeamResolutionError

type IssueCreatePlan = {
  readonly team: string
  readonly title: string
  readonly labels: readonly string[]
  readonly assignee: string | null
  readonly priority: number | null
}

const isNoneValue = (value: string): boolean => value.toLowerCase() === "none"

const stateByName = (states: readonly WorkflowState[], name: string): WorkflowState | undefined =>
  states.find((state) => state.name.toLowerCase() === name.toLowerCase())

const stateByType = (states: readonly WorkflowState[], type: string): WorkflowState | undefined =>
  states.find((state) => state.type === type)

const unwrapRelation = (payload: {
  readonly success: boolean
}): Effect.Effect<void, IssueWriteError> =>
  payload.success
    ? Effect.void
    : Effect.fail(new IssueWriteError({ message: "Linear did not apply the relation change." }))

const unwrapIssue = (payload: {
  readonly success: boolean
  readonly issue: IssueSummaryNode | null
}): Effect.Effect<IssueSummary, IssueWriteError> =>
  payload.success && payload.issue !== null
    ? Effect.succeed(toSummary(payload.issue))
    : Effect.fail(new IssueWriteError({ message: "Linear did not apply the change." }))

const unwrapComment = (
  payload: {
    readonly success: boolean
    readonly comment: IssueComment | null
  },
  message = "Linear did not create the comment.",
): Effect.Effect<IssueComment, IssueWriteError> =>
  payload.success && payload.comment !== null
    ? Effect.succeed(payload.comment)
    : Effect.fail(new IssueWriteError({ message }))

const unwrapDelete = (
  payload: {
    readonly success: boolean
  },
  message: string,
): Effect.Effect<void, IssueWriteError> =>
  payload.success ? Effect.void : Effect.fail(new IssueWriteError({ message }))

export {
  type BulkTarget,
  type BulkWriteResult,
  type BulkWriteSuccess,
  combineStatus,
  CommentNotFoundError,
  IssueWriteError,
  isNoneValue,
  type IssueCreatePlan,
  type IssueWriteApiError,
  type IssueRelationChange,
  type IssueRelationChanges,
  type IssueWriteResult,
  type RelationKind,
  relationKindInfo,
  type RelationType,
  type RelationWriteResult,
  type ResolvedLabel,
  type ResolvedRelationTarget,
  StateNotFoundError,
  stateByName,
  stateByType,
  unwrapComment,
  unwrapDelete,
  unwrapIssue,
  unwrapRelation,
  type WriteAction,
  type WriteActionName,
  type WriteOptions,
  type WriteStatus,
}
