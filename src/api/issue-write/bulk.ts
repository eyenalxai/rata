import { Effect, Result } from "effect"

import type { IssueSummary } from "@/api/issue-model"
import type {
  BulkTarget,
  BulkWriteResult,
  IssueWriteApiError,
  WriteOptions,
} from "@/api/issue-write/model"
import type { makeIssueWriteResolvers } from "@/api/issue-write/resolvers"

import { isNoneValue } from "@/api/issue-write/model"

type WriteResolvers = ReturnType<typeof makeIssueWriteResolvers>

type LabelMode = "add" | "remove"

type ResolvedLabel = {
  readonly id: string
  readonly name: string
}

const failedResult = (target: BulkTarget, error: IssueWriteApiError): BulkWriteResult => ({
  identifier: target.summary.identifier,
  status: "failed",
  error,
})

const capture = (
  target: BulkTarget,
  write: Effect.Effect<IssueSummary, IssueWriteApiError>,
): Effect.Effect<BulkWriteResult> =>
  write.pipe(
    Effect.map((issue) => ({
      identifier: target.summary.identifier,
      status: "updated" as const,
      issue,
    })),
    Effect.catch((error) => Effect.succeed(failedResult(target, error))),
  )

const desiredLabels = (
  wanted: readonly ResolvedLabel[],
  present: ReadonlySet<string>,
  mode: LabelMode,
): readonly ResolvedLabel[] => {
  const seen = new Set<string>()
  const changes: ResolvedLabel[] = []
  for (const label of wanted) {
    if (seen.has(label.id)) {
      continue
    }
    seen.add(label.id)
    const has = present.has(label.id)
    if (mode === "add" && !has) {
      changes.push(label)
    }
    if (mode === "remove" && has) {
      changes.push(label)
    }
  }
  return changes
}

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
        results.push({
          identifier: target.summary.identifier,
          status: "updated",
          issue: target.summary,
        })
        continue
      }
      results.push(yield* capture(target, resolvers.setAssignee(target.summary.id, targetId)))
    }
    return results
  })

  const labelsPerTeam = Effect.fn("IssueWriteApi.bulkLabelsPerTeam")(function* labelsPerTeam(
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

  const applyLabels = (
    target: BulkTarget,
    labels: readonly ResolvedLabel[],
    mode: LabelMode,
  ): Effect.Effect<BulkWriteResult> =>
    Effect.gen(function* applyLabelWrites() {
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

  const writeLabels = (
    mode: LabelMode,
    parentRef: string,
    names: readonly string[],
    options: WriteOptions,
  ): Effect.Effect<readonly BulkWriteResult[], IssueWriteApiError> =>
    Effect.gen(function* writeChildLabels() {
      const targets = yield* resolvers.collectChildTargets(parentRef)
      const perTeam = yield* labelsPerTeam(targets, names)
      const results: BulkWriteResult[] = []
      for (const target of targets) {
        const wanted = perTeam.get(target.teamId) ?? []
        const present = new Set(target.summary.labels.map((label) => label.id))
        const changes = desiredLabels(wanted, present, mode)
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
