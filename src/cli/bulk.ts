import { Effect } from "effect"

import type { IssueSummary } from "@/api/issue-model"
import type { BulkStatus, BulkWriteResult } from "@/api/issue-write/model"
import type { ErrorReport } from "@/cli/output"

import { classifyError, writeJson, writeLine } from "@/cli/output"

type BulkJsonResult = {
  readonly identifier: string
  readonly status: BulkStatus
  readonly issue?: IssueSummary | undefined
  readonly error?: ErrorReport | undefined
}

const failureReport = (result: BulkWriteResult): ErrorReport =>
  result.error === undefined
    ? { code: "internal", message: "The write failed.", hint: null }
    : classifyError(result.error)

const jsonResult = (result: BulkWriteResult): BulkJsonResult =>
  result.status === "failed"
    ? {
        identifier: result.identifier,
        status: result.status,
        error: failureReport(result),
      }
    : {
        identifier: result.identifier,
        status: result.status,
        issue: result.issue,
      }

const writeBulkResults = (
  json: boolean,
  dryRun: boolean,
  results: readonly BulkWriteResult[],
  format: (result: BulkWriteResult) => string,
): Effect.Effect<void> =>
  Effect.gen(function* writeBulk() {
    const failed = results.some((result) => result.status === "failed")
    yield* json
      ? writeJson({ dryRun, results: results.map(jsonResult) })
      : Effect.forEach(
          results,
          (result) =>
            writeLine(
              result.status === "failed"
                ? `${result.identifier} failed: ${failureReport(result).message}`
                : format(result),
            ),
          { discard: true },
        )
    if (failed) {
      yield* Effect.sync(() => {
        process.exitCode = 1
      })
    }
  })

export { writeBulkResults }
