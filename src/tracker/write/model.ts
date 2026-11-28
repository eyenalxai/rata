import { Effect, Schema } from "effect"

import type { LabelNotFoundError } from "@/api/label"
import type { ProjectNotFoundError } from "@/api/project/errors"
import type { TeamNotFoundError, TeamResolutionError } from "@/api/team"
import type { ContextLabelNotFoundError, ContextStateNotFoundError } from "@/context/model"
import type { ContextResolver } from "@/context/resolve"
import type { ContextResolveError } from "@/context/resolve/model"
import type { SectionBatchError } from "@/domain/body/section/batch"
import type { SectionLookupError } from "@/domain/body/section/model"
import type { ConflictError } from "@/domain/conflict"
import type { IssueId, LabelId } from "@/domain/id"
import type { InvalidIssueRef } from "@/domain/issue-ref"
import type { PlanStatus } from "@/domain/plan"
import type { Priority } from "@/domain/priority"
import type { RelationKind } from "@/domain/relation"
import type { LinearClientShape } from "@/linear/client"
import type { IssueComment, IssueSummaryNode } from "@/linear/decode/issue"
import type { LinearApiError } from "@/linear/errors"
import type { LinearGatewayShape } from "@/linear/gateway"
import type { IssueSummary } from "@/tracker/model"
import type { IssueRefNotFoundError } from "@/tracker/read/batch"

import { toSummary } from "@/tracker/model"

class IssueWriteError extends Schema.TaggedError<IssueWriteError>()("IssueWriteError", {
  message: Schema.String,
}) {}

type IssueWriteDependencies = {
  readonly client: LinearClientShape
  readonly contexts: ContextResolver["Service"]
  readonly gateway: LinearGatewayShape
}

type WriteStatus = PlanStatus

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

type IssueRelationChanges = {
  readonly blocks: readonly string[]
  readonly blockedBy: readonly string[]
  readonly related: readonly string[]
  readonly duplicate: readonly string[]
}

type ResolvedRelationTarget = {
  readonly kind: RelationKind
  readonly target: string
  readonly targetId: IssueId
}

type IssueWriteApiError =
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

export {
  type BulkWriteResult,
  type BulkWriteSuccess,
  IssueWriteError,
  isNoneValue,
  type IssueCreatePlan,
  type IssueWriteDependencies,
  type IssueWriteApiError,
  type IssueRelationChanges,
  type ResolvedLabel,
  type ResolvedRelationTarget,
  unwrapComment,
  unwrapIssue,
  unwrapRelation,
  type WriteStatus,
}
