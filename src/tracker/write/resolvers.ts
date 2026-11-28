import { Effect } from "effect"

import type { ResolvedContext } from "@/context/model"
import type { IssueId, LabelId, ProjectId, UserId } from "@/domain/id"
import type {
  IssueWriteApiError,
  IssueWriteDependencies,
  ResolvedLabel,
} from "@/tracker/write/model"

import { ProjectNotFoundError } from "@/api/project/errors"
import { isUuid, projectId as asProjectId, userId as asUserId } from "@/domain/id"
import { parseRefOrFail } from "@/domain/issue-ref"
import { collectConnection, pageSize } from "@/linear/connection"
import { AddLabelResponse, RemoveLabelResponse } from "@/linear/decode/issue"
import { resolveLabels as resolveLabelNames, resolveStateName } from "@/tracker/resolve"
import { addLabelMutation, removeLabelMutation } from "@/tracker/write/documents"
import { unwrapIssue } from "@/tracker/write/model"
import { makeRelationResolvers } from "@/tracker/write/relations"

const makeIssueWriteResolvers = ({ client, contexts, gateway }: IssueWriteDependencies) => {
  const resolveIssueId = Effect.fn("IssueWriter.resolveIssueId")(function* resolveIssueId(
    input: string,
  ) {
    const ref = yield* parseRefOrFail(input)
    return yield* gateway.issue.id(ref)
  })

  const issueTeamContext = Effect.fn("IssueWriter.issueTeamContext")(
    function* resolveIssueTeamContext(context: ResolvedContext, issueId: IssueId) {
      const teamId = yield* gateway.issue.teamId(issueId)
      if (context.team?.identity.id === teamId) {
        return context
      }
      return yield* contexts.resolve({ teamId, viewer: false })
    },
  )

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
  ): Effect.fn.Return<UserId, IssueWriteApiError> {
    if (value.toLowerCase() === "me") {
      return (yield* contexts.viewer(context)).id
    }
    return asUserId(value)
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
        message: `No project named ${value}. Run \`rata admin project list\` to see the projects.`,
      })
    }
    return match.id
  })

  const teamStateIdByName = Effect.fn("IssueWriter.teamStateIdByName")(function* teamStateIdByName(
    context: ResolvedContext,
    name: string,
  ) {
    const state = yield* resolveStateName(contexts, context, name)
    return state.id
  })

  const issueStateIdByName = Effect.fn("IssueWriter.issueStateIdByName")(
    function* issueStateIdByName(context: ResolvedContext, issueId: IssueId, name: string) {
      const target = yield* issueTeamContext(context, issueId)
      const state = yield* resolveStateName(contexts, target, name)
      return state.id
    },
  )

  const resolveLabels = Effect.fn("IssueWriter.resolveLabels")(function* resolveLabels(
    context: ResolvedContext,
    names: readonly string[],
  ): Effect.fn.Return<readonly ResolvedLabel[], IssueWriteApiError> {
    const resolved = yield* resolveLabelNames(contexts, context, names)
    return resolved.map((label) => ({ id: label.id, name: label.name }))
  })

  const resolveIssueLabels = Effect.fn("IssueWriter.resolveIssueLabels")(
    function* resolveIssueLabels(
      context: ResolvedContext,
      issueId: IssueId,
      names: readonly string[],
    ): Effect.fn.Return<readonly ResolvedLabel[], IssueWriteApiError> {
      const target = yield* issueTeamContext(context, issueId)
      const resolved = yield* resolveLabelNames(contexts, target, names)
      return resolved.map((label) => ({ id: label.id, name: label.name }))
    },
  )

  return {
    ...makeRelationResolvers({ client }),
    addLabel,
    issueStateIdByName,
    removeLabel,
    resolveAssignee,
    resolveIssueId,
    resolveIssueLabels,
    resolveLabels,
    resolveProjectId,
    teamStateIdByName,
  }
}

export { makeIssueWriteResolvers }
