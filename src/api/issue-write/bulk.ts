import { Effect, Result } from "effect"

import type { IssueSummary } from "@/api/issue-model"
import type {
  BulkTarget,
  BulkWriteResult,
  IssueWriteApiError,
  ResolvedLabel,
  WriteOptions,
} from "@/api/issue-write/model"
import type { makeIssueWriteResolvers } from "@/api/issue-write/resolvers"
import type { LabelMode } from "@/domain/labels"

import { isNoneValue } from "@/api/issue-write/model"
import { labelChanges } from "@/domain/labels"

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
  const assignChildren = Effect.fn("IssueWriteApi.assignChildren")(function* assignChildren(
    parentRef: string,
    assignee: string,
    options: WriteOptions = {},
  ) {
    const targets = yield* resolvers.collectChildTargets(parentRef)
    const targetId = isNoneValue(assignee) ? null : yield* resolvers.resolveAssignee(assignee)
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
      if (options.dryRun === true) {
        results.push(updatedResult(target, target.summary))
        continue
      }
      const write = resolvers.setAssignee(target.summary.id, targetId)
      results.push(
        yield* write.pipe(
          Effect.map((issue) => updatedResult(target, issue)),
          Effect.catch((error) => Effect.succeed(failedResult(target, error))),
        ),
      )
    }
    return results
  })

  const labelsPerTeam = Effect.fn("IssueWriteApi.labelsPerTeam")(function* labelsPerTeam(
    targets: readonly BulkTarget[],
    names: readonly string[],
  ) {
    const resolved = new Map<string, readonly ResolvedLabel[]>()
    for (const target of targets) {
      if (resolved.has(target.teamId)) {
        continue
      }
      resolved.set(target.teamId, yield* resolvers.resolveLabels(target.teamId, names))
    }
    return resolved
  })

  const applyLabels = Effect.fn("IssueWriteApi.applyLabels")(function* applyLabels(
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

  const writeLabels = Effect.fn("IssueWriteApi.writeChildLabels")(function* writeLabels(
    mode: LabelMode,
    parentRef: string,
    names: readonly string[],
    options: WriteOptions,
  ) {
    const targets = yield* resolvers.collectChildTargets(parentRef)
    const perTeam = yield* labelsPerTeam(targets, names)
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

  const addLabelsToChildren = Effect.fn("IssueWriteApi.addLabelsToChildren")(
    function* addLabelsToChildren(
      parentRef: string,
      names: readonly string[],
      options: WriteOptions = {},
    ) {
      return yield* writeLabels("add", parentRef, names, options)
    },
  )

  const removeLabelsFromChildren = Effect.fn("IssueWriteApi.removeLabelsFromChildren")(
    function* removeLabelsFromChildren(
      parentRef: string,
      names: readonly string[],
      options: WriteOptions = {},
    ) {
      return yield* writeLabels("remove", parentRef, names, options)
    },
  )

  return { addLabelsToChildren, assignChildren, removeLabelsFromChildren }
}

export { makeBulkWrites }
