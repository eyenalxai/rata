import { Effect, Schema } from "effect"

import type { LabelNotFoundError } from "@/api/label"
import type { ProjectNotFoundError } from "@/api/project/errors"
import type { TeamNotFoundError, TeamResolutionError } from "@/api/team"
import type { ContextLabelNotFoundError, ContextStateNotFoundError } from "@/context/model"
import type { ContextResolver } from "@/context/resolve"
import type { ContextResolveError } from "@/context/resolve/model"
import type { SectionBatchError } from "@/domain/body/section/edit"
import type { SectionLookupError } from "@/domain/body/section/model"
import type { ConflictError } from "@/domain/conflict"
import type { IssueId, LabelId } from "@/domain/id"
import type { InvalidIssueRef } from "@/domain/issue-ref"
import type { PlanActionName, PlanStatus, PlanStep } from "@/domain/plan"
import type { Priority } from "@/domain/priority"
import type { RelationKind } from "@/domain/relation"
import type { LinearClientShape } from "@/linear/client"
import type { IssueComment, IssueSummaryNode } from "@/linear/decode/issue"
import type { LinearApiError } from "@/linear/errors"
import type { LinearGatewayShape } from "@/linear/gateway"
import type { IssueSummary } from "@/tracker/model"
import type { IssueRefNotFoundError } from "@/tracker/read/batch"

import { CommentId, TeamId } from "@/domain/id"
import { toSummary } from "@/tracker/model"

class IssueWriteError extends Schema.TaggedError<IssueWriteError>()("IssueWriteError", {
  message: Schema.String,
}) {}

class StateNotFoundError extends Schema.TaggedError<StateNotFoundError>()("StateNotFoundError", {
  state: Schema.String,
  teamId: TeamId,
  message: Schema.String,
}) {}

class CommentNotFoundError extends Schema.TaggedError<CommentNotFoundError>()(
  "CommentNotFoundError",
  {
    id: CommentId,
    message: Schema.String,
  },
) {}

class AssigneeConflictError extends Schema.TaggedError<AssigneeConflictError>()(
  "AssigneeConflictError",
  {
    message: Schema.String,
    assignee: Schema.String,
  },
) {}

type IssueWriteDependencies = {
  readonly client: LinearClientShape
  readonly contexts: ContextResolver["Service"]
  readonly gateway: LinearGatewayShape
}

type WriteStatus = PlanStatus

type WriteActionName = PlanActionName

type WriteAction = PlanStep

type WriteOptions = {
  readonly dryRun?: boolean | undefined
  readonly take?: boolean | undefined
}

type BulkTarget = {
  readonly summary: IssueSummary
  readonly teamId: TeamId
}

type ResolvedLabel = {
  readonly id: LabelId
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

type ResolvedRelationTarget = {
  readonly kind: RelationKind
  readonly target: string
  readonly targetId: IssueId
}

type RelationWriteResult = {
  readonly status: WriteStatus
  readonly changes: readonly IssueRelationChange[]
  readonly actions: readonly WriteAction[]
}

type IssueWriteApiError =
  | AssigneeConflictError
  | CommentNotFoundError
  | InvalidIssueRef
  | IssueRefNotFoundError
  | IssueWriteError
  | ConflictError
  | ContextLabelNotFoundError
  | ContextResolveError
  | ContextStateNotFoundError
  | LabelNotFoundError
  | LinearApiError
  | ProjectNotFoundError
  | SectionBatchError
  | SectionLookupError
  | StateNotFoundError
  | TeamNotFoundError
  | TeamResolutionError

type IssueCreatePlan = {
  readonly team: string
  readonly title: string
  readonly labels: readonly string[]
  readonly assignee: string | null
  readonly priority: Priority | null
}

const isNoneValue = (value: string): boolean => value.toLowerCase() === "none"

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
  AssigneeConflictError,
  type BulkTarget,
  type BulkWriteResult,
  type BulkWriteSuccess,
  combineStatus,
  CommentNotFoundError,
  IssueWriteError,
  isNoneValue,
  type IssueCreatePlan,
  type IssueWriteDependencies,
  type IssueWriteApiError,
  type IssueRelationChange,
  type IssueRelationChanges,
  type IssueWriteResult,
  type RelationWriteResult,
  type ResolvedLabel,
  type ResolvedRelationTarget,
  StateNotFoundError,
  unwrapComment,
  unwrapDelete,
  unwrapIssue,
  unwrapRelation,
  type WriteAction,
  type WriteActionName,
  type WriteOptions,
  type WriteStatus,
}
