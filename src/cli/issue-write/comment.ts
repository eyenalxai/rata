import { Effect, Result } from "effect"

import type { IssueSummary } from "@/api/issue-model"
import type { IssueWriteApi } from "@/api/issue-write"

import { classifyError, exitCodeOf } from "@/cli/error-report"
import { errorLine, writeJson, writeLine } from "@/cli/output"

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
    const report = classifyError(created.failure)
    if (!json) {
      yield* writeLine(`Updated ${issue.identifier}.`)
      return yield* errorLine(report.code, report.message, report.hint ?? undefined)
    }
    yield* writeJson({ issue, comment: null, ...extra, error: report })
    yield* Effect.sync(() => {
      process.exitCode = exitCodeOf(report.code)
    })
    return yield* Effect.void
  }
  if (json) {
    return yield* writeJson({ issue, comment: created.success.comment, ...extra })
  }
  yield* writeLine(`Updated ${issue.identifier}.`)
  return yield* writeLine(`Commented on ${issue.identifier}.`)
})

export { postUpdateComment }
