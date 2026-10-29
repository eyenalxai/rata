import { Context, Effect, Layer, Option } from "effect"

import type {
  IssueCreateOptions,
  IssueUpdateOptions,
  IssueWriteApiShape,
} from "@/api/issue-write/model"

import { LinearClient } from "@/api/client"
import { createIssueMutation, updateIssueMutation } from "@/api/issue-query"
import { CreateIssueResponse, UpdateIssueResponse } from "@/api/issue-schema"
import { makeIssueWrites } from "@/api/issue-write/issue-writes"
import { unwrapIssue } from "@/api/issue-write/model"
import { makeRelationWrites } from "@/api/issue-write/relation-writes"
import { makeIssueWriteResolvers } from "@/api/issue-write/resolvers"
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
      const issueWrites = makeIssueWrites(resolvers)
      const relationWrites = makeRelationWrites({ client, resolvers })

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

      return IssueWriteApi.of({
        ...issueWrites,
        ...relationWrites,
        comment,
        create,
        update,
      })
    }),
  )
}

export { IssueWriteApi }
