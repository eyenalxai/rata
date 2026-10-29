import { Effect } from "effect"

import type { WriteAction, WriteOptions, WriteStatus } from "@/api/issue-write/model"
import type { makeIssueWriteResolvers } from "@/api/issue-write/resolvers"

import { combineStatus } from "@/api/issue-write/model"

type WriteResolvers = ReturnType<typeof makeIssueWriteResolvers>

const isNoneValue = (value: string): boolean => value.toLowerCase() === "none"

const makeIssueWrites = (resolvers: WriteResolvers) => {
  const addLabels = Effect.fn("IssueWriteApi.addLabels")(function* addLabels(
    ref: string,
    names: readonly string[],
    options: WriteOptions = {},
  ) {
    const summary = yield* resolvers.readIssueSummary(ref)
    const teamId = yield* resolvers.resolveIssueTeamId(summary.id)
    const resolved = yield* resolvers.resolveLabels(teamId, names)
    const current = yield* resolvers.collectIssueLabels(summary.id)
    const present = new Set(current.map((label) => label.id))
    const actions: WriteAction[] = []
    const seen = new Set<string>()
    let issue = summary
    for (const [index, resolvedLabel] of resolved.entries()) {
      const labelId = resolvedLabel.id
      if (seen.has(labelId)) {
        continue
      }
      seen.add(labelId)
      const label = names[index] ?? labelId
      if (present.has(labelId)) {
        actions.push({
          action: "add-label",
          target: ref,
          status: "skipped",
          changes: { label },
        })
        continue
      }
      actions.push({
        action: "add-label",
        target: ref,
        status: "updated",
        changes: { label },
      })
      if (options.dryRun !== true) {
        issue = yield* resolvers.addLabel(summary.id, labelId)
      }
    }
    return { status: combineStatus(actions), issue, actions }
  })

  const removeLabels = Effect.fn("IssueWriteApi.removeLabels")(function* removeLabels(
    ref: string,
    names: readonly string[],
    options: WriteOptions = {},
  ) {
    const summary = yield* resolvers.readIssueSummary(ref)
    const teamId = yield* resolvers.resolveIssueTeamId(summary.id)
    const resolved = yield* resolvers.resolveLabels(teamId, names)
    const current = yield* resolvers.collectIssueLabels(summary.id)
    const present = new Set(current.map((label) => label.id))
    const actions: WriteAction[] = []
    const seen = new Set<string>()
    let issue = summary
    for (const [index, resolvedLabel] of resolved.entries()) {
      const labelId = resolvedLabel.id
      if (seen.has(labelId)) {
        continue
      }
      seen.add(labelId)
      const label = names[index] ?? labelId
      if (!present.has(labelId)) {
        actions.push({
          action: "remove-label",
          target: ref,
          status: "skipped",
          changes: { label },
        })
        continue
      }
      actions.push({
        action: "remove-label",
        target: ref,
        status: "updated",
        changes: { label },
      })
      if (options.dryRun !== true) {
        issue = yield* resolvers.removeLabel(summary.id, labelId)
      }
    }
    return { status: combineStatus(actions), issue, actions }
  })

  const close = Effect.fn("IssueWriteApi.close")(function* close(ref: string, body?: string) {
    const summary = yield* resolvers.readIssueSummary(ref)
    const commented = body !== undefined
    if (commented) {
      yield* resolvers.postComment(summary.id, body)
    }
    if (summary.state.type === "completed") {
      return {
        status: commented ? ("updated" as const) : ("skipped" as const),
        issue: summary,
        actions: [
          {
            action: "close" as const,
            target: ref,
            status: "skipped" as const,
            changes: { state: "completed" },
          },
        ],
      }
    }
    const issue = yield* resolvers.setStateByType(summary.id, "completed")
    return {
      status: "updated" as const,
      issue,
      actions: [
        {
          action: "close" as const,
          target: ref,
          status: "updated" as const,
          changes: { state: "completed" },
        },
      ],
    }
  })

  const reopen = Effect.fn("IssueWriteApi.reopen")(function* reopen(ref: string) {
    const issueId = yield* resolvers.resolveIssueId(ref)
    return yield* resolvers.setStateByType(issueId, "unstarted")
  })

  const assign = Effect.fn("IssueWriteApi.assign")(function* assign(
    ref: string,
    assignee: string,
    options: WriteOptions = {},
  ) {
    const summary = yield* resolvers.readIssueSummary(ref)
    const targetId = isNoneValue(assignee) ? null : yield* resolvers.resolveAssignee(assignee)
    const currentId = summary.assignee?.id ?? null
    const status: WriteStatus = currentId === targetId ? "skipped" : "updated"
    const actions: readonly WriteAction[] = [
      {
        action: "assign",
        target: ref,
        status,
        changes: { assignee: targetId === null ? null : assignee },
      },
    ]
    if (status === "skipped" || options.dryRun === true) {
      return { status, issue: summary, actions }
    }
    const issue = yield* resolvers.setAssignee(summary.id, targetId)
    return { status, issue, actions }
  })

  const unassign = Effect.fn("IssueWriteApi.unassign")(function* unassign(
    ref: string,
    options: WriteOptions = {},
  ) {
    const summary = yield* resolvers.readIssueSummary(ref)
    const status: WriteStatus = summary.assignee === null ? "skipped" : "updated"
    const actions: readonly WriteAction[] = [
      {
        action: "unassign",
        target: ref,
        status,
        changes: { assignee: null },
      },
    ]
    if (status === "skipped" || options.dryRun === true) {
      return { status, issue: summary, actions }
    }
    const issue = yield* resolvers.setAssignee(summary.id, null)
    return { status, issue, actions }
  })

  return { addLabels, assign, close, removeLabels, reopen, unassign }
}

export { makeIssueWrites }
