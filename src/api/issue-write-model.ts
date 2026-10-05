import { Effect, Schema } from "effect"

import type { LinearApiError } from "@/api/errors"
import type { IssueSummary } from "@/api/issue-model"
import type { IssueComment, IssueSummaryNode, WorkflowState } from "@/api/issue-schema"
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
}

const parseRefOrFail = (input: string): Effect.Effect<IssueRef, InvalidIssueRef> =>
  Effect.fromResult(parseIssueRef(input))

const stateByName = (states: readonly WorkflowState[], name: string): WorkflowState | undefined =>
  states.find((state) => state.name.toLowerCase() === name.toLowerCase())

const stateByType = (states: readonly WorkflowState[], type: string): WorkflowState | undefined =>
  states.find((state) => state.type === type)

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
  type IssueUpdateOptions,
  type IssueWriteApiError,
  type IssueWriteApiShape,
  LabelNotFoundError,
  parseRefOrFail,
  ProjectNotFoundError,
  StateNotFoundError,
  stateByName,
  stateByType,
  TeamResolutionError,
  unwrapComment,
  unwrapIssue,
}
