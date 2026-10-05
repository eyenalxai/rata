import { Effect, Schema } from "effect"

import type { LinearApiError } from "@/api/errors"
import type { IssueSummary } from "@/api/issue-model"
import type {
  IssueComment,
  IssueInverseRelation,
  IssueRelation,
  IssueSummaryNode,
  WorkflowState,
} from "@/api/issue-schema"
import type { TeamNotFoundError } from "@/api/team"
import type { RepoConfigError } from "@/config/repo"
import type { InvalidIssueRef, IssueRef } from "@/domain/ref"

import { toSummary } from "@/api/issue-model"
import { parseIssueRef } from "@/domain/ref"

class IssueWriteError extends Schema.TaggedError<IssueWriteError>()("IssueWriteError", {
  message: Schema.String,
}) {}

class TeamResolutionError extends Schema.TaggedError<TeamResolutionError>()("TeamResolutionError", {
  message: Schema.String,
}) {}

class StateNotFoundError extends Schema.TaggedError<StateNotFoundError>()("StateNotFoundError", {
  state: Schema.String,
  teamId: Schema.String,
  message: Schema.String,
}) {}

class LabelNotFoundError extends Schema.TaggedError<LabelNotFoundError>()("LabelNotFoundError", {
  name: Schema.String,
  teamId: Schema.String,
  message: Schema.String,
}) {}

class ProjectNotFoundError extends Schema.TaggedError<ProjectNotFoundError>()(
  "ProjectNotFoundError",
  {
    name: Schema.String,
    message: Schema.String,
  },
) {}

const relationKinds = ["blocks", "blockedBy", "related", "duplicate"] as const
type RelationKind = (typeof relationKinds)[number]

class RelationNotFoundError extends Schema.TaggedError<RelationNotFoundError>()(
  "RelationNotFoundError",
  {
    kind: Schema.Literals(relationKinds),
    target: Schema.String,
    message: Schema.String,
  },
) {}

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
}

type IssueRelationChanges = {
  readonly blocks: readonly string[]
  readonly blockedBy: readonly string[]
  readonly related: readonly string[]
  readonly duplicate: readonly string[]
}

type IssueRelationChange = {
  readonly action: "created" | "deleted"
  readonly kind: RelationKind
  readonly target: string
}

type RelationType = "blocks" | "related" | "duplicate"

type ResolvedRelationTarget = {
  readonly kind: RelationKind
  readonly target: string
  readonly targetId: string
}

type PlannedRelationLink = {
  readonly kind: RelationKind
  readonly target: string
  readonly input: {
    readonly issueId: string
    readonly relatedIssueId: string
    readonly type: RelationType
  }
}

type PlannedRelationUnlink = {
  readonly kind: RelationKind
  readonly target: string
  readonly relationId: string
}

type IssueWriteApiError =
  | InvalidIssueRef
  | IssueWriteError
  | LabelNotFoundError
  | LinearApiError
  | ProjectNotFoundError
  | RelationNotFoundError
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
  ) => Effect.Effect<IssueSummary, IssueWriteApiError>
  readonly removeLabels: (
    ref: string,
    names: readonly string[],
  ) => Effect.Effect<IssueSummary, IssueWriteApiError>
  readonly close: (ref: string, body?: string) => Effect.Effect<IssueSummary, IssueWriteApiError>
  readonly reopen: (ref: string) => Effect.Effect<IssueSummary, IssueWriteApiError>
  readonly assign: (
    ref: string,
    assignee: string,
  ) => Effect.Effect<IssueSummary, IssueWriteApiError>
  readonly unassign: (ref: string) => Effect.Effect<IssueSummary, IssueWriteApiError>
  readonly link: (
    ref: string,
    changes: IssueRelationChanges,
  ) => Effect.Effect<readonly IssueRelationChange[], IssueWriteApiError>
  readonly unlink: (
    ref: string,
    changes: IssueRelationChanges,
  ) => Effect.Effect<readonly IssueRelationChange[], IssueWriteApiError>
}

const parseRefOrFail = (input: string): Effect.Effect<IssueRef, InvalidIssueRef> =>
  Effect.fromResult(parseIssueRef(input))

const stateByName = (states: readonly WorkflowState[], name: string): WorkflowState | undefined =>
  states.find((state) => state.name.toLowerCase() === name.toLowerCase())

const stateByType = (states: readonly WorkflowState[], type: string): WorkflowState | undefined =>
  states.find((state) => state.type === type)

const relationTypeFor = (kind: RelationKind): RelationType =>
  kind === "blocks" || kind === "blockedBy" ? "blocks" : kind

const linkRelationPlans = (
  issueId: string,
  targets: readonly ResolvedRelationTarget[],
): readonly PlannedRelationLink[] =>
  targets.map((entry) => {
    const inverse = entry.kind === "blockedBy"
    return {
      kind: entry.kind,
      target: entry.target,
      input: {
        issueId: inverse ? entry.targetId : issueId,
        relatedIssueId: inverse ? issueId : entry.targetId,
        type: relationTypeFor(entry.kind),
      },
    }
  })

const matchingRelationIds = (
  kind: RelationKind,
  targetId: string,
  outgoing: readonly IssueRelation[],
  incoming: readonly IssueInverseRelation[],
): readonly string[] => {
  if (kind === "blockedBy") {
    return incoming
      .filter((relation) => relation.type === "blocks" && relation.issue.id === targetId)
      .map((relation) => relation.id)
  }
  if (kind === "related") {
    return [
      ...outgoing
        .filter((relation) => relation.type === "related" && relation.relatedIssue.id === targetId)
        .map((relation) => relation.id),
      ...incoming
        .filter((relation) => relation.type === "related" && relation.issue.id === targetId)
        .map((relation) => relation.id),
    ]
  }
  if (kind === "duplicate") {
    return outgoing
      .filter((relation) => relation.type === "duplicate" && relation.relatedIssue.id === targetId)
      .map((relation) => relation.id)
  }
  return outgoing
    .filter((relation) => relation.type === "blocks" && relation.relatedIssue.id === targetId)
    .map((relation) => relation.id)
}

const planRelationUnlinks = (
  targets: readonly ResolvedRelationTarget[],
  outgoing: readonly IssueRelation[],
  incoming: readonly IssueInverseRelation[],
): Effect.Effect<readonly PlannedRelationUnlink[], RelationNotFoundError> =>
  Effect.gen(function* planUnlinks() {
    const plans: PlannedRelationUnlink[] = []
    for (const entry of targets) {
      const relationIds = matchingRelationIds(entry.kind, entry.targetId, outgoing, incoming)
      if (relationIds.length === 0) {
        return yield* new RelationNotFoundError({
          kind: entry.kind,
          target: entry.target,
          message: `No ${entry.kind} relation to ${entry.target}.`,
        })
      }
      for (const relationId of relationIds) {
        plans.push({ kind: entry.kind, target: entry.target, relationId })
      }
    }
    return plans
  })

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
  IssueWriteError,
  type IssueCreateOptions,
  type IssueRelationChange,
  type IssueRelationChanges,
  type IssueUpdateOptions,
  type IssueWriteApiError,
  type IssueWriteApiShape,
  LabelNotFoundError,
  linkRelationPlans,
  parseRefOrFail,
  type PlannedRelationLink,
  type PlannedRelationUnlink,
  planRelationUnlinks,
  ProjectNotFoundError,
  type RelationKind,
  RelationNotFoundError,
  type ResolvedRelationTarget,
  StateNotFoundError,
  stateByName,
  stateByType,
  TeamResolutionError,
  unwrapComment,
  unwrapIssue,
  unwrapRelation,
}
