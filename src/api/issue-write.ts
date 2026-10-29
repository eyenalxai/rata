import { Context, Effect, Layer } from "effect"

import type { IssueWriteApiShape } from "@/api/issue-write/api-shape"

import { LinearClient } from "@/api/client"
import { makeBodyWrites } from "@/api/issue-write/body"
import { makeBulkWrites } from "@/api/issue-write/bulk"
import { makeCommentWrites } from "@/api/issue-write/comments"
import { makeCreateWrites } from "@/api/issue-write/create"
import { makeIssueWrites } from "@/api/issue-write/issue-writes"
import { makeRelationWrites } from "@/api/issue-write/relation-writes"
import { makeIssueWriteResolvers } from "@/api/issue-write/resolvers"
import { makeVisibilityChecks } from "@/api/issue-write/visibility"
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
      const visibility = makeVisibilityChecks({ client })
      const issueWrites = makeIssueWrites(resolvers)
      const bulkWrites = makeBulkWrites(resolvers)
      const relationWrites = makeRelationWrites({ client, resolvers })
      const bodyWrites = makeBodyWrites({ client, resolvers })
      const commentWrites = makeCommentWrites({ client, resolvers, visibility })
      const createWrites = makeCreateWrites({
        client,
        repoConfig,
        repoTeam,
        resolvers,
        visibility,
      })

      return IssueWriteApi.of({
        ...issueWrites,
        ...bulkWrites,
        ...relationWrites,
        ...createWrites,
        ...bodyWrites,
        ...commentWrites,
      })
    }),
  )
}

export { IssueWriteApi }
