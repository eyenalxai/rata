import { Effect } from "effect"

import type { LinearApiError } from "@/api/errors"
import type {
  BulkTarget,
  IssueWriteApiError,
  IssueWriteDependencies,
  ResolvedLabel,
} from "@/api/issue-write/model"
import type { IssueId, LabelId, ProjectId, TeamId, UserId, WorkflowStateId } from "@/domain/id"
import type { StateType, WorkflowStateNode } from "@/domain/workflow-state"

import { toSummary } from "@/api/issue-model"
import {
  addLabelMutation,
  bulkTargetsQuery,
  createCommentMutation,
  issueIdQuery,
  issueStatesQuery,
  issueSummaryQuery,
  issueTeamQuery,
  labelsQuery,
  removeLabelMutation,
  teamStatesQuery,
  updateIssueMutation,
} from "@/api/issue-query"
import {
  AddLabelResponse,
  BulkTargetsResponse,
  CreateCommentResponse,
  IssueIdResponse,
  IssueStatesResponse,
  IssueSummaryResponse,
  IssueTeamResponse,
  LabelsResponse,
  RemoveLabelResponse,
  TeamStatesResponse,
  UpdateIssueResponse,
} from "@/api/issue-schema"
import { StateNotFoundError, unwrapComment, unwrapIssue } from "@/api/issue-write/model"
import { makeRelationResolvers } from "@/api/issue-write/relations"
import { labelNotFoundError } from "@/api/label"
import { collectConnection, collectPages, pageSize } from "@/api/pagination"
import { ProjectNotFoundError } from "@/api/project/errors"
import {
  isUuid,
  issueId as asIssueId,
  projectId as asProjectId,
  userId as asUserId,
} from "@/domain/id"
import { parseRefOrFail } from "@/domain/issue-ref"
import { findLabelByName } from "@/domain/label"
import { stateByName, stateByType } from "@/domain/workflow-state"

const makeIssueWriteResolvers = ({ client, labels, projects }: IssueWriteDependencies) => {
  const resolveIssueId = Effect.fn("IssueWriteApi.resolveIssueId")(function* resolveIssueId(
    input: string,
  ) {
    const ref = yield* parseRefOrFail(input)
    if (isUuid(ref)) {
      return asIssueId(ref)
    }
    const data = yield* client.execute(issueIdQuery, { id: ref }, IssueIdResponse)
    return data.issue.id
  })

  const readIssueSummary = Effect.fn("IssueWriteApi.readIssueSummary")(function* readIssueSummary(
    input: string,
  ) {
    const ref = yield* parseRefOrFail(input)
    const data = yield* client.execute(issueSummaryQuery, { id: ref }, IssueSummaryResponse)
    return toSummary(data.issue)
  })

  const collectIssueLabels = Effect.fn("IssueWriteApi.collectIssueLabels")(
    function* collectIssueLabels(issueId: IssueId) {
      return yield* collectConnection((after) =>
        client
          .execute(labelsQuery, { id: issueId, first: pageSize, after }, LabelsResponse)
          .pipe(Effect.map((data) => data.issue.labels)),
      )
    },
  )

  const collectChildTargets = Effect.fn("IssueWriteApi.collectChildTargets")(
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

  const setAssignee = Effect.fn("IssueWriteApi.setAssignee")(function* setAssignee(
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

  const addLabel = Effect.fn("IssueWriteApi.addLabel")(function* addLabel(
    issueId: IssueId,
    labelId: LabelId,
  ) {
    const data = yield* client.execute(addLabelMutation, { id: issueId, labelId }, AddLabelResponse)
    return yield* unwrapIssue(data.issueAddLabel)
  })

  const removeLabel = Effect.fn("IssueWriteApi.removeLabel")(function* removeLabel(
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

  const resolveAssignee = Effect.fn("IssueWriteApi.resolveAssignee")(function* resolveAssignee(
    value: string,
  ): Effect.fn.Return<UserId, LinearApiError> {
    if (value.toLowerCase() === "me") {
      return (yield* client.viewer).id
    }
    return asUserId(value)
  })

  const viewerId = Effect.fn("IssueWriteApi.viewerId")(function* viewerId(): Effect.fn.Return<
    UserId,
    LinearApiError
  > {
    return (yield* client.viewer).id
  })

  const resolveProjectId = Effect.fn("IssueWriteApi.resolveProjectId")(function* resolveProjectId(
    value: string,
  ): Effect.fn.Return<ProjectId, IssueWriteApiError> {
    if (isUuid(value)) {
      return asProjectId(value)
    }
    const all = yield* collectConnection((after) => projects.list({ after, limit: pageSize }))
    const match = all.find((project) => project.name.toLowerCase() === value.toLowerCase())
    if (match === undefined) {
      return yield* new ProjectNotFoundError({
        ref: value,
        message: `No project named ${value}. Run \`rata project list\` to see the projects.`,
      })
    }
    return match.id
  })

  const stateIdByName = Effect.fn("IssueWriteApi.stateIdByName")(function* stateIdByName(
    states: readonly WorkflowStateNode[],
    teamId: TeamId,
    name: string,
  ): Effect.fn.Return<WorkflowStateId, StateNotFoundError> {
    const state = stateByName(states, name)
    if (state === undefined) {
      return yield* new StateNotFoundError({
        state: name,
        teamId,
        message: `No workflow state named ${name} in team ${teamId}.`,
      })
    }
    return state.id
  })

  const stateIdByType = Effect.fn("IssueWriteApi.stateIdByType")(function* stateIdByType(
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

  const teamStateIdByName = Effect.fn("IssueWriteApi.teamStateIdByName")(
    function* teamStateIdByName(teamId: TeamId, name: string) {
      const states = yield* collectConnection((after) =>
        client
          .execute(teamStatesQuery, { teamId, first: pageSize, after }, TeamStatesResponse)
          .pipe(Effect.map((data) => data.team.states)),
      )
      return yield* stateIdByName(states, teamId, name)
    },
  )

  const issueStates = Effect.fn("IssueWriteApi.issueStates")(function* issueStates(
    issueId: IssueId,
  ) {
    const first = yield* client.execute(
      issueStatesQuery,
      { id: issueId, first: pageSize, after: null },
      IssueStatesResponse,
    )
    const teamId = first.issue.team.id
    const states = yield* collectPages(first.issue.team.states, (after) =>
      client
        .execute(issueStatesQuery, { id: issueId, first: pageSize, after }, IssueStatesResponse)
        .pipe(Effect.map((page) => page.issue.team.states)),
    )
    return { states, teamId }
  })

  const issueStateIdByName = Effect.fn("IssueWriteApi.issueStateIdByName")(
    function* issueStateIdByName(issueId: IssueId, name: string) {
      const team = yield* issueStates(issueId)
      return yield* stateIdByName(team.states, team.teamId, name)
    },
  )

  const setStateByType = Effect.fn("IssueWriteApi.setStateByType")(function* setStateByType(
    issueId: IssueId,
    type: StateType,
  ) {
    const team = yield* issueStates(issueId)
    const stateId = yield* stateIdByType(team.states, team.teamId, type)
    const data = yield* client.execute(
      updateIssueMutation,
      { id: issueId, input: { stateId } },
      UpdateIssueResponse,
    )
    return yield* unwrapIssue(data.issueUpdate)
  })

  const resolveLabels = Effect.fn("IssueWriteApi.resolveLabels")(function* resolveLabels(
    teamId: TeamId,
    names: readonly string[],
  ): Effect.fn.Return<readonly ResolvedLabel[], IssueWriteApiError> {
    const available = yield* collectConnection((after) =>
      labels.listAvailable(teamId, { after, limit: pageSize }),
    )
    const resolved: readonly ResolvedLabel[] = yield* Effect.forEach(names, (name) => {
      const match = findLabelByName(available, name)
      if (match === undefined) {
        return Effect.fail(labelNotFoundError(teamId, name))
      }
      return Effect.succeed({ id: match.id, name: match.name })
    })
    return resolved
  })

  const postComment = Effect.fn("IssueWriteApi.postComment")(function* postComment(
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

  const resolveIssueTeamId = Effect.fn("IssueWriteApi.resolveIssueTeamId")(
    function* resolveIssueTeamId(issueId: IssueId) {
      const data = yield* client.execute(issueTeamQuery, { id: issueId }, IssueTeamResponse)
      return data.issue.team.id
    },
  )

  return {
    ...makeRelationResolvers({ client }),
    addLabel,
    collectChildTargets,
    collectIssueLabels,
    issueStateIdByName,
    postComment,
    readIssueSummary,
    removeLabel,
    resolveAssignee,
    resolveIssueId,
    resolveIssueTeamId,
    resolveLabels,
    resolveProjectId,
    setAssignee,
    setStateByType,
    teamStateIdByName,
    viewerId,
  }
}

export { makeIssueWriteResolvers }
