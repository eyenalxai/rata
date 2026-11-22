import { Effect } from "effect"

import type { ResolvedContext } from "@/context/model"
import type { IssueId, LabelId, ProjectId, TeamId, UserId, WorkflowStateId } from "@/domain/id"
import type { StateType, WorkflowStateNode } from "@/domain/workflow-state"
import type { LinearApiError } from "@/linear/errors"
import type {
  BulkTarget,
  IssueWriteApiError,
  IssueWriteDependencies,
  ResolvedLabel,
} from "@/tracker/write/model"

import { ProjectNotFoundError } from "@/api/project/errors"
import { TeamResolutionError } from "@/api/team"
import { isUuid, projectId as asProjectId, userId as asUserId } from "@/domain/id"
import { parseRefOrFail } from "@/domain/issue-ref"
import { stateByType } from "@/domain/workflow-state"
import { collectConnection, pageSize } from "@/linear/connection"
import {
  AddLabelResponse,
  BulkTargetsResponse,
  CreateCommentResponse,
  LabelsResponse,
  RemoveLabelResponse,
  UpdateIssueResponse,
} from "@/linear/decode/issue"
import { labelsQuery } from "@/linear/documents/issue"
import { toSummary } from "@/tracker/model"
import { resolveLabels as resolveLabelNames, resolveStateName } from "@/tracker/resolve"
import {
  addLabelMutation,
  bulkTargetsQuery,
  createCommentMutation,
  removeLabelMutation,
  updateIssueMutation,
} from "@/tracker/write/documents"
import { StateNotFoundError, unwrapComment, unwrapIssue } from "@/tracker/write/model"
import { makeRelationResolvers } from "@/tracker/write/relations"

const makeIssueWriteResolvers = ({ client, contexts, gateway }: IssueWriteDependencies) => {
  const resolveIssueId = Effect.fn("IssueWriter.resolveIssueId")(function* resolveIssueId(
    input: string,
  ) {
    const ref = yield* parseRefOrFail(input)
    return yield* gateway.issue.id(ref)
  })

  const readIssueSummary = Effect.fn("IssueWriter.readIssueSummary")(function* readIssueSummary(
    input: string,
  ) {
    const ref = yield* parseRefOrFail(input)
    return toSummary(yield* gateway.issue.summary(ref))
  })

  const collectIssueLabels = Effect.fn("IssueWriter.collectIssueLabels")(
    function* collectIssueLabels(issueId: IssueId) {
      return yield* collectConnection((after) =>
        client
          .execute(labelsQuery, { id: issueId, first: pageSize, after }, LabelsResponse)
          .pipe(Effect.map((data) => data.issue.labels)),
      )
    },
  )

  const collectChildTargets = Effect.fn("IssueWriter.collectChildTargets")(
    function* collectChildTargets(ref: string) {
      const parentId = yield* resolveIssueId(ref)
      const nodes = yield* collectConnection((after) =>
        client
          .execute(bulkTargetsQuery, { id: parentId, first: pageSize, after }, BulkTargetsResponse)
          .pipe(Effect.map((data) => data.issue.children)),
      )
      return nodes.map((node): BulkTarget => ({ summary: toSummary(node), teamId: node.team.id }))
    },
  )

  const setAssignee = Effect.fn("IssueWriter.setAssignee")(function* setAssignee(
    issueId: IssueId,
    assigneeId: UserId | null,
  ) {
    const data = yield* client.execute(
      updateIssueMutation,
      { id: issueId, input: { assigneeId } },
      UpdateIssueResponse,
    )
    return yield* unwrapIssue(data.issueUpdate)
  })

  const addLabel = Effect.fn("IssueWriter.addLabel")(function* addLabel(
    issueId: IssueId,
    labelId: LabelId,
  ) {
    const data = yield* client.execute(addLabelMutation, { id: issueId, labelId }, AddLabelResponse)
    return yield* unwrapIssue(data.issueAddLabel)
  })

  const removeLabel = Effect.fn("IssueWriter.removeLabel")(function* removeLabel(
    issueId: IssueId,
    labelId: LabelId,
  ) {
    const data = yield* client.execute(
      removeLabelMutation,
      { id: issueId, labelId },
      RemoveLabelResponse,
    )
    return yield* unwrapIssue(data.issueRemoveLabel)
  })

  const resolveAssignee = Effect.fn("IssueWriter.resolveAssignee")(function* resolveAssignee(
    context: ResolvedContext,
    value: string,
  ): Effect.fn.Return<UserId, LinearApiError> {
    if (value.toLowerCase() === "me") {
      return context.viewer === null ? (yield* client.viewer).id : context.viewer.id
    }
    return asUserId(value)
  })

  const viewerId = Effect.fn("IssueWriter.viewerId")(function* viewerId(
    context: ResolvedContext,
  ): Effect.fn.Return<UserId, LinearApiError> {
    return context.viewer === null ? (yield* client.viewer).id : context.viewer.id
  })

  const resolveProjectId = Effect.fn("IssueWriter.resolveProjectId")(function* resolveProjectId(
    value: string,
  ): Effect.fn.Return<ProjectId, IssueWriteApiError> {
    if (isUuid(value)) {
      return asProjectId(value)
    }
    const all = yield* collectConnection((after) =>
      gateway.project.list({ after, limit: pageSize }),
    )
    const match = all.find((project) => project.name.toLowerCase() === value.toLowerCase())
    if (match === undefined) {
      return yield* new ProjectNotFoundError({
        ref: value,
        message: `No project named ${value}. Run \`rata project list\` to see the projects.`,
      })
    }
    return match.id
  })

  const stateIdByType = Effect.fn("IssueWriter.stateIdByType")(function* stateIdByType(
    states: readonly WorkflowStateNode[],
    teamId: TeamId,
    type: StateType,
  ): Effect.fn.Return<WorkflowStateId, StateNotFoundError> {
    const state = stateByType(states, type)
    if (state === undefined) {
      return yield* new StateNotFoundError({
        state: type,
        teamId,
        message: `Team ${teamId} has no workflow state of type ${type}.`,
      })
    }
    return state.id
  })

  const teamStateIdByName = Effect.fn("IssueWriter.teamStateIdByName")(function* teamStateIdByName(
    context: ResolvedContext,
    name: string,
  ) {
    const state = yield* resolveStateName(contexts, context, name)
    return state.id
  })

  const setStateByType = Effect.fn("IssueWriter.setStateByType")(function* setStateByType(
    context: ResolvedContext,
    issueId: IssueId,
    type: StateType,
  ) {
    if (context.team === null) {
      return yield* new TeamResolutionError({
        message: "No team. Pass --team, or run `rata link`.",
      })
    }
    const stateId = yield* stateIdByType(context.states, context.team.identity.id, type)
    const data = yield* client.execute(
      updateIssueMutation,
      { id: issueId, input: { stateId } },
      UpdateIssueResponse,
    )
    return yield* unwrapIssue(data.issueUpdate)
  })

  const resolveLabels = Effect.fn("IssueWriter.resolveLabels")(function* resolveLabels(
    context: ResolvedContext,
    names: readonly string[],
  ): Effect.fn.Return<readonly ResolvedLabel[], IssueWriteApiError> {
    const resolved = yield* resolveLabelNames(contexts, context, names)
    return resolved.map((label) => ({ id: label.id, name: label.name }))
  })

  const postComment = Effect.fn("IssueWriter.postComment")(function* postComment(
    issueId: IssueId,
    body: string,
  ) {
    const data = yield* client.execute(
      createCommentMutation,
      { input: { issueId, body } },
      CreateCommentResponse,
    )
    return yield* unwrapComment(data.commentCreate)
  })

  return {
    ...makeRelationResolvers({ client }),
    addLabel,
    collectChildTargets,
    collectIssueLabels,
    postComment,
    readIssueSummary,
    removeLabel,
    resolveAssignee,
    resolveIssueId,
    resolveLabels,
    resolveProjectId,
    setAssignee,
    setStateByType,
    teamStateIdByName,
    viewerId,
  }
}

export { makeIssueWriteResolvers }
