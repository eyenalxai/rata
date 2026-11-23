import type { Effect, Option } from "effect"

import type { ResolvedContext } from "@/context/model"
import type { TrackerError } from "@/domain/error"
import type { CommentId, IssueId, ProjectId, UserId } from "@/domain/id"
import type { IssueComment, IssueInverseRelation, IssueRelation } from "@/linear/decode/issue"
import type { TeamState } from "@/linear/decode/team"
import type { ApplyStep } from "@/tracker/plan"
import type {
  IssueWriteApiError,
  IssueCreatePlan,
  IssueRelationChanges,
  IssueWriteResult,
  ResolvedLabel,
  ResolvedRelationTarget,
} from "@/tracker/write/model"
import type { IssueCreateOptions, IssueCreateResult } from "@/tracker/write/write-types"

type RelationSnapshot = {
  readonly outgoing: readonly IssueRelation[]
  readonly incoming: readonly IssueInverseRelation[]
}

type IssueWriterShape = {
  readonly create: (
    context: ResolvedContext,
    options: IssueCreateOptions,
  ) => Effect.Effect<IssueCreateResult, IssueWriteApiError>
  readonly planCreate: (
    context: ResolvedContext,
    options: IssueCreateOptions,
  ) => Effect.Effect<IssueCreatePlan, IssueWriteApiError>
  readonly close: (
    context: ResolvedContext,
    ref: string,
    body?: string,
    options?: { readonly dryRun?: boolean | undefined },
  ) => Effect.Effect<IssueWriteResult, IssueWriteApiError>
  readonly applyStep: (step: ApplyStep) => Effect.Effect<void, TrackerError>
  readonly resolveState: (
    context: ResolvedContext,
    issueId: IssueId,
    name: string,
  ) => Effect.Effect<TeamState, TrackerError>
  readonly resolveLabels: (
    context: ResolvedContext,
    issueId: IssueId,
    names: readonly string[],
  ) => Effect.Effect<readonly ResolvedLabel[], TrackerError>
  readonly resolveAssignee: (
    context: ResolvedContext,
    value: string,
  ) => Effect.Effect<UserId, TrackerError>
  readonly resolveProject: (value: string) => Effect.Effect<ProjectId, TrackerError>
  readonly resolveParent: (value: string) => Effect.Effect<IssueId, TrackerError>
  readonly resolveRelations: (
    ref: string,
    changes: IssueRelationChanges,
  ) => Effect.Effect<readonly ResolvedRelationTarget[], TrackerError>
  readonly collectRelations: (issueId: IssueId) => Effect.Effect<RelationSnapshot, TrackerError>
  readonly findComment: (
    commentId: CommentId,
  ) => Effect.Effect<Option.Option<IssueComment>, TrackerError>
}

export { type IssueWriterShape }
