import { Context, Effect, Layer } from "effect"

import type { IssueUpdateOptions, IssueWriteApiShape } from "@/api/issue-write/model"

import { LinearClient } from "@/api/client"
import { updateIssueMutation } from "@/api/issue-query"
import { UpdateIssueResponse } from "@/api/issue-schema"
import { makeBulkWrites } from "@/api/issue-write/bulk"
import { makeCreateWrites } from "@/api/issue-write/create"
import { makeIssueWrites } from "@/api/issue-write/issue-writes"
import { unwrapIssue } from "@/api/issue-write/model"
import { makeRelationWrites } from "@/api/issue-write/relation-writes"
import { makeIssueWriteResolvers } from "@/api/issue-write/resolvers"
import { LabelService } from "@/api/label"
import { ProjectService } from "@/api/project"
import { RepoTeam } from "@/api/repo-team"
import { RepoConfigService } from "@/config/repo"

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
      const bulkWrites = makeBulkWrites(resolvers)
      const relationWrites = makeRelationWrites({ client, resolvers })
      const createWrites = makeCreateWrites({ client, repoConfig, repoTeam, resolvers })

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
        ...bulkWrites,
        ...relationWrites,
        ...createWrites,
        comment,
        update,
      })
    }),
  )
}

export { IssueWriteApi }
