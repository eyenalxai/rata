import { Effect } from "effect"

import type { makeIssueWriteResolvers } from "@/api/issue-write/resolvers"
import type { IssueUpdateOptions } from "@/api/issue-write/write-types"

const makeUpdateFields = (resolvers: ReturnType<typeof makeIssueWriteResolvers>) =>
  Effect.fn("IssueWriteApi.resolveUpdateFields")(function* resolveUpdateFields(
    issueId: string,
    options: IssueUpdateOptions,
  ) {
    const input: Record<string, unknown> = {}
    if (options.title !== undefined) {
      input.title = options.title
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
    return input
  })

export { makeUpdateFields }
