import { Effect } from "effect"

import type { IssueId } from "@/domain/id"
import type { LinearClientShape } from "@/linear/client"
import type { IssueWriteApiError } from "@/tracker/write/model"

import { ConflictError } from "@/domain/conflict"
import { parseRefOrFail } from "@/domain/issue-ref"
import { IssueBodyResponse, issueBodyQuery } from "@/tracker/write/body/query"

const ensureUnchanged = (
  identifier: string,
  current: string,
  expected: string | undefined,
): Effect.Effect<void, ConflictError> =>
  expected === undefined || current === expected
    ? Effect.void
    : Effect.fail(
        new ConflictError({
          expected,
          current,
          message: `${identifier} changed since you read it.`,
        }),
      )

const makeReadIssueBody = (client: LinearClientShape) =>
  Effect.fn("IssueWriter.readIssueBody")(function* readIssueBody(input: string): Effect.fn.Return<
    {
      readonly id: IssueId
      readonly identifier: string
      readonly description: string | null
      readonly updatedAt: string
    },
    IssueWriteApiError
  > {
    const ref = yield* parseRefOrFail(input)
    const data = yield* client.execute(issueBodyQuery, { id: ref }, IssueBodyResponse)
    return data.issue
  })

export { ensureUnchanged, makeReadIssueBody }
