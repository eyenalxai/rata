import { Effect } from "effect"

import type { WriteAction, WriteOptions, WriteStatus } from "@/api/issue-write/model"
import type { makeIssueWriteResolvers } from "@/api/issue-write/resolvers"

import { combineStatus, isNoneValue } from "@/api/issue-write/model"

type WriteResolvers = ReturnType<typeof makeIssueWriteResolvers>

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

  const close = Effect.fn("IssueWriteApi.close")(function* close(
    ref: string,
    body?: string,
    options: WriteOptions = {},
  ) {
    const summary = yield* resolvers.readIssueSummary(ref)
    const commented = body !== undefined
    const alreadyCompleted = summary.state.type === "completed"
    const status = alreadyCompleted ? ("skipped" as const) : ("updated" as const)
    const actions: readonly WriteAction[] = [
      {
        action: "close" as const,
        target: ref,
        status,
        changes: { state: "completed" },
      },
      ...(commented
        ? [
            {
              action: "comment-create" as const,
              target: ref,
              status: "updated" as const,
              changes: { body },
            },
          ]
        : []),
    ]
    if (options.dryRun === true) {
      return { status, issue: summary, actions }
    }
    if (commented) {
      yield* resolvers.postComment(summary.id, body)
    }
    if (alreadyCompleted) {
      return { status: commented ? ("updated" as const) : status, issue: summary, actions }
    }
    const issue = yield* resolvers.setStateByType(summary.id, "completed")
    return { status, issue, actions }
  })

  const reopen = Effect.fn("IssueWriteApi.reopen")(function* reopen(
    ref: string,
    options: WriteOptions = {},
  ) {
    const summary = yield* resolvers.readIssueSummary(ref)
    const alreadyOpen = summary.state.type === "unstarted"
    const status = alreadyOpen ? ("skipped" as const) : ("updated" as const)
    const actions: readonly WriteAction[] = [
      {
        action: "reopen" as const,
        target: ref,
        status,
        changes: { state: "unstarted" },
      },
    ]
    if (alreadyOpen || options.dryRun === true) {
      return { status, issue: summary, actions }
    }
    const issue = yield* resolvers.setStateByType(summary.id, "unstarted")
    return { status, issue, actions }
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
