import { Effect, Schema } from "effect"

import type { LinearApiError } from "@/api/errors"
import type { IssueSummary } from "@/api/issue-model"
import type { IssueComment, IssueSummaryNode, WorkflowState } from "@/api/issue-schema"
import type { LabelNotFoundError } from "@/api/label"
import type { ProjectNotFoundError } from "@/api/project/errors"
import type { TeamNotFoundError, TeamResolutionError } from "@/api/team"
import type { RepoConfigError } from "@/config/repo"
import type { InvalidIssueRef, IssueRef } from "@/domain/ref"

import { toSummary } from "@/api/issue-model"
import { parseIssueRef } from "@/domain/ref"

class IssueWriteError extends Schema.TaggedError<IssueWriteError>()("IssueWriteError", {
  message: Schema.String,
}) {}

class StateNotFoundError extends Schema.TaggedError<StateNotFoundError>()("StateNotFoundError", {
  state: Schema.String,
  teamId: Schema.String,
  message: Schema.String,
}) {}

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

type IssueWriteResult = {
  readonly status: WriteStatus
  readonly issue: IssueSummary
  readonly actions: readonly WriteAction[]
}

const combineStatus = (actions: readonly { readonly status: WriteStatus }[]): WriteStatus =>
  actions.some((action) => action.status === "updated") ? "updated" : "skipped"

type IssueCreateOptions = {
  readonly title: string
  readonly body?: string | undefined
  readonly team?: string | undefined
  readonly labels?: readonly string[] | undefined
  readonly parent?: string | undefined
  readonly project?: string | undefined
  readonly state?: string | undefined
  readonly assignee?: string | undefined
  readonly priority?: number | undefined
}

type IssueUpdateOptions = {
  readonly title?: string | undefined
  readonly body?: string | undefined
  readonly state?: string | undefined
  readonly assignee?: string | undefined
  readonly project?: string | undefined
  readonly parent?: string | undefined
  readonly priority?: number | undefined
}

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
  | InvalidIssueRef
  | IssueWriteError
  | LabelNotFoundError
  | LinearApiError
  | ProjectNotFoundError
  | RepoConfigError
  | StateNotFoundError
  | TeamNotFoundError
  | TeamResolutionError

type IssueWriteApiShape = {
  readonly create: (options: IssueCreateOptions) => Effect.Effect<IssueSummary, IssueWriteApiError>
  readonly comment: (ref: string, body: string) => Effect.Effect<IssueComment, IssueWriteApiError>
  readonly update: (
    ref: string,
    options: IssueUpdateOptions,
  ) => Effect.Effect<IssueSummary, IssueWriteApiError>
  readonly addLabels: (
    ref: string,
    names: readonly string[],
    options?: WriteOptions,
  ) => Effect.Effect<IssueWriteResult, IssueWriteApiError>
  readonly removeLabels: (
    ref: string,
    names: readonly string[],
    options?: WriteOptions,
  ) => Effect.Effect<IssueWriteResult, IssueWriteApiError>
  readonly close: (
    ref: string,
    body?: string,
  ) => Effect.Effect<IssueWriteResult, IssueWriteApiError>
  readonly reopen: (ref: string) => Effect.Effect<IssueSummary, IssueWriteApiError>
  readonly assign: (
    ref: string,
    assignee: string,
    options?: WriteOptions,
  ) => Effect.Effect<IssueWriteResult, IssueWriteApiError>
  readonly unassign: (
    ref: string,
    options?: WriteOptions,
  ) => Effect.Effect<IssueWriteResult, IssueWriteApiError>
  readonly link: (
    ref: string,
    changes: IssueRelationChanges,
    options?: WriteOptions,
  ) => Effect.Effect<RelationWriteResult, IssueWriteApiError>
  readonly unlink: (
    ref: string,
    changes: IssueRelationChanges,
    options?: WriteOptions,
  ) => Effect.Effect<RelationWriteResult, IssueWriteApiError>
}

const parseRefOrFail = (input: string): Effect.Effect<IssueRef, InvalidIssueRef> =>
  Effect.fromResult(parseIssueRef(input))

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

const unwrapComment = (payload: {
  readonly success: boolean
  readonly comment: IssueComment | null
}): Effect.Effect<IssueComment, IssueWriteError> =>
  payload.success && payload.comment !== null
    ? Effect.succeed(payload.comment)
    : Effect.fail(new IssueWriteError({ message: "Linear did not create the comment." }))

export {
  combineStatus,
  IssueWriteError,
  type IssueCreateOptions,
  type IssueRelationChange,
  type IssueRelationChanges,
  type IssueUpdateOptions,
  type IssueWriteApiError,
  type IssueWriteApiShape,
  type IssueWriteResult,
  parseRefOrFail,
  type RelationKind,
  relationKindInfo,
  type RelationType,
  type RelationWriteResult,
  type ResolvedRelationTarget,
  StateNotFoundError,
  stateByName,
  stateByType,
  unwrapComment,
  unwrapIssue,
  unwrapRelation,
  type WriteAction,
  type WriteActionName,
  type WriteOptions,
  type WriteStatus,
}
