import { Effect, Result } from "effect"

import type { IssueSummary } from "@/api/issue-model"
import type { IssueWriteApi } from "@/api/issue-write"

import { toTrackerError } from "@/cli/error-report"
import { reportTrackerError, writeJson, writeLine } from "@/cli/output"

const postUpdateComment = Effect.fn("Cli.IssueWrite.postUpdateComment")(function* postUpdateComment(
  api: IssueWriteApi["Service"],
  json: boolean,
  ref: string,
  issue: IssueSummary,
  body: string,
  extra: Readonly<Record<string, unknown>> = {},
) {
  const created = yield* Effect.result(api.commentCreate(ref, body, { waitSeconds: 0 }))
  if (Result.isFailure(created)) {
    const report = toTrackerError(created.failure)
    if (!json) {
      yield* writeLine(`Updated ${issue.identifier}.`)
      return yield* reportTrackerError(report, false)
    }
    return yield* reportTrackerError(report, true, { issue, comment: null, ...extra })
  }
  if (json) {
    return yield* writeJson({ issue, comment: created.success.comment, ...extra })
  }
  yield* writeLine(`Updated ${issue.identifier}.`)
  return yield* writeLine(`Commented on ${issue.identifier}.`)
})

export { postUpdateComment }
