import { Effect, Schema } from "effect"

import type { IssueSummary } from "@/api/issue-model"

import { parseRefOrFail } from "@/domain/ref"

class IssueRefNotFoundError extends Schema.TaggedError<IssueRefNotFoundError>()(
  "IssueRefNotFoundError",
  {
    refs: Schema.Array(Schema.String),
    message: Schema.String,
  },
) {}

const parseBatchRefs = Effect.fn("IssueBatch.parseRefs")(function* parseBatchRefs(
  refs: readonly string[],
) {
  const parsed: string[] = []
  for (const ref of refs) {
    parsed.push(yield* parseRefOrFail(ref))
  }
  return [...new Set(parsed)]
})

const requireBatchRefs = (
  requested: readonly string[],
  issues: readonly IssueSummary[],
): Effect.Effect<void, IssueRefNotFoundError> => {
  const missing = requested.filter(
    (ref) => !issues.some((issue) => issue.id === ref || issue.identifier === ref),
  )
  if (missing.length === 0) {
    return Effect.void
  }
  const names = missing.join(", ")
  return Effect.fail(
    new IssueRefNotFoundError({
      refs: missing,
      message: missing.length === 1 ? `No issue matches ${names}.` : `No issues match ${names}.`,
    }),
  )
}

export { IssueRefNotFoundError, parseBatchRefs, requireBatchRefs }
