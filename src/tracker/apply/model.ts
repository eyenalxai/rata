import type { Effect, Option } from "effect"

import type { ResolvedContext } from "@/context/model"
import type { TrackerError } from "@/domain/error"
import type { CommentId, IssueId, ProjectId, UserId } from "@/domain/id"
import type { IssueComment, IssueInverseRelation, IssueRelation } from "@/linear/decode/issue"
import type { TeamState } from "@/linear/decode/team"
import type { IssueReader } from "@/tracker/read"
import type {
  IssueRelationChanges,
  ResolvedLabel,
  ResolvedRelationTarget,
} from "@/tracker/write/model"

type RelationSnapshot = {
  readonly outgoing: readonly IssueRelation[]
  readonly incoming: readonly IssueInverseRelation[]
}

type ApplyWriter = {
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
  readonly findComment: (
    commentId: CommentId,
  ) => Effect.Effect<Option.Option<IssueComment>, TrackerError>
  readonly collectRelations: (issueId: IssueId) => Effect.Effect<RelationSnapshot, TrackerError>
}

type ApplyDependencies = {
  readonly reader: IssueReader["Service"]
  readonly writer: ApplyWriter
}

type ApplyPlanOptions = {
  readonly removeRelations?: boolean | undefined
}

type ApplyPlanError = TrackerError

export {
  type ApplyDependencies,
  type ApplyPlanError,
  type ApplyPlanOptions,
  type ApplyWriter,
  type RelationSnapshot,
}
