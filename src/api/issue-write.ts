import { Context, Effect, Layer, Option } from "effect"

import type {
  IssueCreateOptions,
  IssueRelationChange,
  IssueRelationChanges,
  IssueUpdateOptions,
  IssueWriteApiError,
  IssueWriteApiShape,
} from "@/api/issue-write-model"

import { LinearClient } from "@/api/client"
import {
  addLabelMutation,
  createIssueMutation,
  createRelationMutation,
  deleteRelationMutation,
  removeLabelMutation,
  updateIssueMutation,
} from "@/api/issue-query"
import {
  AddLabelResponse,
  CreateIssueResponse,
  CreateRelationResponse,
  DeleteRelationResponse,
  RemoveLabelResponse,
  UpdateIssueResponse,
} from "@/api/issue-schema"
import {
  IssueWriteError,
  linkRelationPlans,
  planRelationUnlinks,
  unwrapIssue,
  unwrapRelation,
} from "@/api/issue-write-model"
import { makeIssueWriteResolvers } from "@/api/issue-write-resolvers"
import { LabelService } from "@/api/label"
import { ProjectService } from "@/api/project"
import { RepoTeam } from "@/api/repo-team"
import { currentDirectory, RepoConfigService } from "@/config/repo"

class IssueWriteApi extends Context.Service<IssueWriteApi, IssueWriteApiShape>()(
  "rata-cli/api/issue-write/IssueWriteApi",
) {
  static readonly layer = Layer.effect(
    IssueWriteApi,
    Effect.gen(function* issueWriteApiLayer() {
      const client = yield* LinearClient
      const labels = yield* LabelService
      const projects = yield* ProjectService
      const repoConfig = yield* RepoConfigService
      const repoTeam = yield* RepoTeam
      const resolvers = makeIssueWriteResolvers({ client, labels, projects })

      const create = Effect.fn("IssueWriteApi.create")(function* create(
        options: IssueCreateOptions,
      ) {
        const config = Option.getOrUndefined(yield* repoConfig.read(yield* currentDirectory))
        const teamId = yield* repoTeam.resolve(options.team)
        const input: Record<string, unknown> = { teamId, title: options.title }
        if (options.body !== undefined && options.body.length > 0) {
          input.description = options.body
        }
        if (options.labels !== undefined && options.labels.length > 0) {
          input.labelIds = yield* resolvers.resolveLabelIds(teamId, options.labels)
        }
        if (options.state !== undefined) {
          input.stateId = yield* resolvers.teamStateIdByName(teamId, options.state)
        }
        if (options.parent !== undefined) {
          input.parentId = yield* resolvers.resolveIssueId(options.parent)
        }
        const project = options.project ?? config?.project
        if (project !== undefined) {
          input.projectId = yield* resolvers.resolveProjectId(project)
        }
        if (options.assignee !== undefined) {
          input.assigneeId = yield* resolvers.resolveAssignee(options.assignee)
        }
        if (options.priority !== undefined) {
          input.priority = options.priority
        }
        const data = yield* client.execute(createIssueMutation, { input }, CreateIssueResponse)
        return yield* unwrapIssue(data.issueCreate)
      })

      const comment = Effect.fn("IssueWriteApi.comment")(function* comment(
        ref: string,
        body: string,
      ) {
        const issueId = yield* resolvers.resolveIssueId(ref)
        return yield* resolvers.postComment(issueId, body)
      })

      const update = Effect.fn("IssueWriteApi.update")(function* update(
        ref: string,
        options: IssueUpdateOptions,
      ) {
        const issueId = yield* resolvers.resolveIssueId(ref)
        const input: Record<string, unknown> = {}
        if (options.title !== undefined) {
          input.title = options.title
        }
        if (options.body !== undefined) {
          input.description = options.body
        }
        if (options.state !== undefined) {
          input.stateId = yield* resolvers.issueStateIdByName(issueId, options.state)
        }
        if (options.assignee !== undefined) {
          input.assigneeId = yield* resolvers.resolveAssignee(options.assignee)
        }
        if (options.project !== undefined) {
          input.projectId = yield* resolvers.resolveProjectId(options.project)
        }
        if (options.parent !== undefined) {
          input.parentId = yield* resolvers.resolveIssueId(options.parent)
        }
        if (options.priority !== undefined) {
          input.priority = options.priority
        }
        const data = yield* client.execute(
          updateIssueMutation,
          { id: issueId, input },
          UpdateIssueResponse,
        )
        return yield* unwrapIssue(data.issueUpdate)
      })

      const addLabels = Effect.fn("IssueWriteApi.addLabels")(function* addLabels(
        ref: string,
        names: readonly string[],
      ) {
        const issueId = yield* resolvers.resolveIssueId(ref)
        const teamId = yield* resolvers.resolveIssueTeamId(issueId)
        const ids = yield* resolvers.resolveLabelIds(teamId, names)
        const issues = yield* Effect.forEach(ids, (labelId) =>
          client
            .execute(addLabelMutation, { id: issueId, labelId }, AddLabelResponse)
            .pipe(Effect.flatMap((data) => unwrapIssue(data.issueAddLabel))),
        )
        const last = issues.at(-1)
        if (last === undefined) {
          return yield* new IssueWriteError({ message: "No labels to add." })
        }
        return last
      })

      const removeLabels = Effect.fn("IssueWriteApi.removeLabels")(function* removeLabels(
        ref: string,
        names: readonly string[],
      ) {
        const issueId = yield* resolvers.resolveIssueId(ref)
        const teamId = yield* resolvers.resolveIssueTeamId(issueId)
        const ids = yield* resolvers.resolveLabelIds(teamId, names)
        const issues = yield* Effect.forEach(ids, (labelId) =>
          client
            .execute(removeLabelMutation, { id: issueId, labelId }, RemoveLabelResponse)
            .pipe(Effect.flatMap((data) => unwrapIssue(data.issueRemoveLabel))),
        )
        const last = issues.at(-1)
        if (last === undefined) {
          return yield* new IssueWriteError({ message: "No labels to remove." })
        }
        return last
      })

      const close = Effect.fn("IssueWriteApi.close")(function* close(ref: string, body?: string) {
        const issueId = yield* resolvers.resolveIssueId(ref)
        if (body !== undefined) {
          yield* resolvers.postComment(issueId, body)
        }
        return yield* resolvers.setStateByType(issueId, "completed")
      })

      const reopen = Effect.fn("IssueWriteApi.reopen")(function* reopen(ref: string) {
        const issueId = yield* resolvers.resolveIssueId(ref)
        return yield* resolvers.setStateByType(issueId, "unstarted")
      })

      const assign = Effect.fn("IssueWriteApi.assign")(function* assign(
        ref: string,
        assignee: string,
      ) {
        const issueId = yield* resolvers.resolveIssueId(ref)
        const assigneeId = yield* resolvers.resolveAssignee(assignee)
        const data = yield* client.execute(
          updateIssueMutation,
          { id: issueId, input: { assigneeId } },
          UpdateIssueResponse,
        )
        return yield* unwrapIssue(data.issueUpdate)
      })

      const unassign = Effect.fn("IssueWriteApi.unassign")(function* unassign(ref: string) {
        const issueId = yield* resolvers.resolveIssueId(ref)
        const data = yield* client.execute(
          updateIssueMutation,
          { id: issueId, input: { assigneeId: null } },
          UpdateIssueResponse,
        )
        return yield* unwrapIssue(data.issueUpdate)
      })

      const link = Effect.fn("IssueWriteApi.link")(function* link(
        ref: string,
        changes: IssueRelationChanges,
      ): Effect.fn.Return<readonly IssueRelationChange[], IssueWriteApiError> {
        const issueId = yield* resolvers.resolveIssueId(ref)
        const targets = yield* resolvers.resolveRelationTargets(changes)
        const plans = linkRelationPlans(issueId, targets)
        return yield* Effect.forEach(plans, (plan) =>
          client
            .execute(createRelationMutation, { input: plan.input }, CreateRelationResponse)
            .pipe(
              Effect.flatMap((data) => unwrapRelation(data.issueRelationCreate)),
              Effect.as({ action: "created" as const, kind: plan.kind, target: plan.target }),
            ),
        )
      })

      const unlink = Effect.fn("IssueWriteApi.unlink")(function* unlink(
        ref: string,
        changes: IssueRelationChanges,
      ): Effect.fn.Return<readonly IssueRelationChange[], IssueWriteApiError> {
        const issueId = yield* resolvers.resolveIssueId(ref)
        const targets = yield* resolvers.resolveRelationTargets(changes)
        const relations = yield* resolvers.collectRelations(issueId)
        const plans = yield* planRelationUnlinks(targets, relations.outgoing, relations.incoming)
        return yield* Effect.forEach(plans, (plan) =>
          client
            .execute(deleteRelationMutation, { id: plan.relationId }, DeleteRelationResponse)
            .pipe(
              Effect.flatMap((data) => unwrapRelation(data.issueRelationDelete)),
              Effect.as({ action: "deleted" as const, kind: plan.kind, target: plan.target }),
            ),
        )
      })

      return IssueWriteApi.of({
        addLabels,
        assign,
        close,
        comment,
        create,
        link,
        removeLabels,
        reopen,
        unassign,
        unlink,
        update,
      })
    }),
  )
}

export { IssueWriteApi }
