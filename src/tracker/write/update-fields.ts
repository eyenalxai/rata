import { Effect } from "effect"

import type { IssueId } from "@/domain/id"
import type { makeIssueWriteResolvers } from "@/tracker/write/resolvers"
import type { IssueUpdateOptions } from "@/tracker/write/write-types"

import { priorityValue } from "@/domain/priority"

const makeUpdateFields = (resolvers: ReturnType<typeof makeIssueWriteResolvers>) =>
  Effect.fn("IssueWriteApi.resolveUpdateFields")(function* resolveUpdateFields(
    issueId: IssueId,
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
      input.priority = priorityValue(options.priority)
    }
    return input
  })

export { makeUpdateFields }
