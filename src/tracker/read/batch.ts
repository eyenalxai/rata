import { Effect, Schema } from "effect"

import type { IssueRef } from "@/domain/issue-ref"

import { parseRefOrFail } from "@/domain/issue-ref"

class IssueRefNotFoundError extends Schema.TaggedError<IssueRefNotFoundError>()(
  "IssueRefNotFoundError",
  {
    code: Schema.tag("not_found"),
    refs: Schema.Array(Schema.String),
    message: Schema.String,
  },
) {}

type IssueIdentity = {
  readonly id: string
  readonly identifier: string
}

const parseBatchRefs = Effect.fn("IssueBatch.parseRefs")(function* parseBatchRefs(
  refs: readonly string[],
) {
  const parsed: IssueRef[] = []
  for (const ref of refs) {
    parsed.push(yield* parseRefOrFail(ref))
  }
  return [...new Set(parsed)]
})

const requireBatchRefs = (
  requested: readonly IssueRef[],
  issues: readonly IssueIdentity[],
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
