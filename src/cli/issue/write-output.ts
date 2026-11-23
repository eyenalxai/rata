import { Effect, Result } from "effect"

import type { CommandOutput } from "@/cli/spec"
import type { TrackerError } from "@/domain/error"
import type { IssueReadDocument } from "@/tracker/model"
import type { ApplyResult } from "@/tracker/plan"
import type { IssueReader, IssueWorkingSetError } from "@/tracker/read"

import { arrayField, objectField, scalarField } from "@/cli/field/shape"
import { formatReadDocument } from "@/cli/issue/format"
import { issueWorkingSetShape } from "@/cli/issue/shape"
import { TrackerError as TrackerErrorClass } from "@/domain/error"
import { exitCodeOf, toTrackerError } from "@/tracker/error-report"

const writeActionShape = objectField({
  action: scalarField,
  target: scalarField,
  status: scalarField,
  changes: scalarField,
})

const failedActionShape = objectField({
  action: scalarField,
  target: scalarField,
  status: scalarField,
  changes: scalarField,
})

const writeErrorShape = objectField({
  code: scalarField,
  message: scalarField,
  hint: scalarField,
})

const applyResultShape = objectField({
  action: scalarField,
  status: scalarField,
  changed: arrayField(scalarField),
  dryRun: scalarField,
  snapshot: scalarField,
  actions: arrayField(writeActionShape),
  failed: failedActionShape,
  error: writeErrorShape,
})

const issueWriteShape = objectField({
  issue: issueWorkingSetShape,
  result: applyResultShape,
})

const publicResult = (action: string, result: ApplyResult) => {
  const report = result.failed?.error
  return {
    action,
    status: result.status,
    changed: result.changed,
    dryRun: result.dryRun,
    snapshot: result.snapshot,
    actions: result.actions,
    ...(result.failed === undefined
      ? {}
      : {
          failed: {
            action: result.failed.action,
            target: result.failed.target,
            status: result.failed.status,
            changes: result.failed.changes,
          },
        }),
    ...(report === undefined
      ? {}
      : { error: { code: report.code, message: report.message, hint: report.hint } }),
  }
}

const resultLines = (result: ApplyResult): readonly string[] => [
  `result: ${result.status}${result.dryRun ? " (dry run)" : ""}`,
  `changed: ${result.changed.length === 0 ? "none" : result.changed.join(", ")}`,
  ...(result.failed === undefined
    ? []
    : [
        `failed: ${result.failed.action} ${result.failed.target}: ${result.failed.error.code}: ${result.failed.error.message}`,
      ]),
]

const writeOutput = (
  issue: IssueReadDocument | null,
  result: ApplyResult,
  action: string,
  readError?: TrackerError,
): CommandOutput => {
  const exitCode = result.failed === undefined ? 0 : exitCodeOf(result.failed.error.code)
  return {
    kind: "resource",
    value: { issue, result: publicResult(action, result) },
    text: [
      ...(issue === null ? ["issue: unavailable"] : [formatReadDocument(issue)]),
      "",
      ...resultLines(result),
      ...(readError === undefined ? [] : [`read: ${readError.code}: ${readError.message}`]),
    ],
    ...(exitCode === 0 ? {} : { exitCode }),
  }
}

const readIssue = (
  reader: IssueReader["Service"],
  ref: string,
): Effect.Effect<IssueReadDocument, TrackerError | IssueWorkingSetError> =>
  reader.workingSet([ref], { comments: false, mode: "working" }).pipe(
    Effect.flatMap((page) => {
      const issue = page.items[0]
      return issue === undefined
        ? Effect.fail(
            new TrackerErrorClass({
              code: "internal",
              message: `The read of ${ref} returned no issue.`,
              hint: null,
            }),
          )
        : Effect.succeed(issue)
    }),
  )

const readForWrite = (
  reader: IssueReader["Service"],
  ref: string,
): Effect.Effect<{
  readonly issue: IssueReadDocument | null
  readonly error?: TrackerError | undefined
}> =>
  readIssue(reader, ref).pipe(
    Effect.result,
    Effect.map((result) =>
      Result.isFailure(result)
        ? { issue: null, error: toTrackerError(result.failure) }
        : { issue: result.success },
    ),
  )

export { issueWriteShape, readForWrite, readIssue, writeOutput }
