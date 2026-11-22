import { Effect, Result } from "effect"

import type { ResolvedContext } from "@/context/model"
import type { TeamId } from "@/domain/id"
import type { LabelMode } from "@/domain/label"
import type { IssueSummary } from "@/tracker/model"
import type {
  BulkTarget,
  BulkWriteResult,
  IssueWriteApiError,
  ResolvedLabel,
  WriteOptions,
} from "@/tracker/write/model"
import type { makeIssueWriteResolvers } from "@/tracker/write/resolvers"

import { labelChanges } from "@/domain/label"
import { AssigneeConflictError, isNoneValue } from "@/tracker/write/model"

type WriteResolvers = ReturnType<typeof makeIssueWriteResolvers>

const failedResult = (target: BulkTarget, error: IssueWriteApiError): BulkWriteResult => ({
  identifier: target.summary.identifier,
  status: "failed",
  error,
})

const updatedResult = (target: BulkTarget, issue: IssueSummary): BulkWriteResult => ({
  identifier: target.summary.identifier,
  status: "updated",
  issue,
})

const makeBulkWrites = (resolvers: WriteResolvers) => {
  const assignChildren = Effect.fn("IssueWriter.assignChildren")(function* assignChildren(
    context: ResolvedContext,
    parentRef: string,
    assignee: string,
    options: WriteOptions = {},
  ) {
    const targets = yield* resolvers.collectChildTargets(parentRef)
    const targetId = isNoneValue(assignee)
      ? null
      : yield* resolvers.resolveAssignee(context, assignee)
    const viewerId = targetId === null ? null : yield* resolvers.viewerId(context)
    const results: BulkWriteResult[] = []
    for (const target of targets) {
      const currentId = target.summary.assignee?.id ?? null
      if (currentId === targetId) {
        results.push({
          identifier: target.summary.identifier,
          status: "skipped",
          issue: target.summary,
        })
        continue
      }
      if (
        targetId !== null &&
        currentId !== null &&
        currentId !== viewerId &&
        currentId !== targetId &&
        options.take !== true
      ) {
        results.push(
          failedResult(
            target,
            new AssigneeConflictError({
              assignee: target.summary.assignee?.name ?? currentId,
              message: `The issue is assigned to ${target.summary.assignee?.name ?? currentId}. Pass --take to reassign it.`,
            }),
          ),
        )
        continue
      }
      if (options.dryRun === true) {
        results.push(updatedResult(target, target.summary))
        continue
      }
      const write = resolvers.setAssignee(target.summary.id, targetId)
      const outcome = yield* write.pipe(Effect.result)
      results.push(
        Result.isFailure(outcome)
          ? failedResult(target, outcome.failure)
          : updatedResult(target, outcome.success),
      )
    }
    return results
  })

  const labelsPerTeam = Effect.fn("IssueWriter.labelsPerTeam")(function* labelsPerTeam(
    context: ResolvedContext,
    targets: readonly BulkTarget[],
    names: readonly string[],
  ) {
    const resolved = new Map<TeamId, readonly ResolvedLabel[]>()
    for (const target of targets) {
      if (resolved.has(target.teamId)) {
        continue
      }
      resolved.set(target.teamId, yield* resolvers.resolveLabels(context, names))
    }
    return resolved
  })

  const applyLabels = Effect.fn("IssueWriter.applyLabels")(function* applyLabels(
    target: BulkTarget,
    labels: readonly ResolvedLabel[],
    mode: LabelMode,
  ) {
    let issue = target.summary
    for (const label of labels) {
      const write =
        mode === "add"
          ? resolvers.addLabel(issue.id, label.id)
          : resolvers.removeLabel(issue.id, label.id)
      const outcome = yield* write.pipe(Effect.result)
      if (Result.isFailure(outcome)) {
        return failedResult(target, outcome.failure)
      }
      issue = outcome.success
    }
    return {
      identifier: target.summary.identifier,
      status: "updated" as const,
      issue,
      labels: labels.map((label) => label.name),
    }
  })

  const writeChildLabels = Effect.fn("IssueWriter.writeChildLabels")(function* writeChildLabels(
    context: ResolvedContext,
    mode: LabelMode,
    parentRef: string,
    names: readonly string[],
    options: WriteOptions,
  ) {
    const targets = yield* resolvers.collectChildTargets(parentRef)
    const perTeam = yield* labelsPerTeam(context, targets, names)
    const results: BulkWriteResult[] = []
    for (const target of targets) {
      const wanted = perTeam.get(target.teamId) ?? []
      const present = new Set(target.summary.labels.map((label) => label.id))
      const changes = labelChanges(wanted, present, mode)
      if (changes.length === 0) {
        results.push({
          identifier: target.summary.identifier,
          status: "skipped",
          issue: target.summary,
          labels: wanted.map((label) => label.name),
        })
        continue
      }
      if (options.dryRun === true) {
        results.push({
          identifier: target.summary.identifier,
          status: "updated",
          issue: target.summary,
          labels: changes.map((label) => label.name),
        })
        continue
      }
      results.push(yield* applyLabels(target, changes, mode))
    }
    return results
  })

  const addLabelsToChildren = Effect.fn("IssueWriter.addLabelsToChildren")(
    function* addLabelsToChildren(
      context: ResolvedContext,
      parentRef: string,
      names: readonly string[],
      options: WriteOptions = {},
    ) {
      return yield* writeChildLabels(context, "add", parentRef, names, options)
    },
  )

  const removeLabelsFromChildren = Effect.fn("IssueWriter.removeLabelsFromChildren")(
    function* removeLabelsFromChildren(
      context: ResolvedContext,
      parentRef: string,
      names: readonly string[],
      options: WriteOptions = {},
    ) {
      return yield* writeChildLabels(context, "remove", parentRef, names, options)
    },
  )

  return { addLabelsToChildren, assignChildren, removeLabelsFromChildren }
}

export { makeBulkWrites }
