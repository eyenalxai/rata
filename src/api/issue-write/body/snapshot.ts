import { Effect } from "effect"

import type { LinearClient } from "@/api/client"
import type { IssueWriteApiError } from "@/api/issue-write/model"

import { IssueBodyResponse, issueBodyQuery } from "@/api/issue-write/body/query"
import { ConflictError } from "@/domain/conflict"
import { parseRefOrFail } from "@/domain/ref"

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

const makeReadIssueBody = (client: LinearClient["Service"]) =>
  Effect.fn("IssueWriteApi.readIssueBody")(function* readIssueBody(input: string): Effect.fn.Return<
    {
      readonly id: string
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
