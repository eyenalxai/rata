import { Effect } from "effect"

import type { CommandOutput } from "@/cli/spec"
import type { IssueReadDocument } from "@/tracker/model"
import type { ApplyResult } from "@/tracker/plan"
import type { IssueReader, IssueWorkingSetError } from "@/tracker/read"

import { exitCodeOf, toTrackerError } from "@/cli/error-report"
import { arrayField, objectField, scalarField } from "@/cli/field/shape"
import { formatReadDocument } from "@/cli/issue/format"
import { issueWorkingSetShape } from "@/cli/issue/shape"
import { TrackerError } from "@/domain/error"

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

type PublicWriteError = {
  readonly code: string
  readonly message: string
  readonly hint: string | null
}

type PublicWriteResult = Omit<ApplyResult, "cause"> & {
  readonly error?: PublicWriteError | undefined
}

const publicResult = (result: ApplyResult): PublicWriteResult => {
  const report = result.cause === undefined ? undefined : toTrackerError(result.cause)
  return {
    action: result.action,
    status: result.status,
    changed: result.changed,
    dryRun: result.dryRun,
    snapshot: result.snapshot,
    actions: result.actions,
    ...(result.failed === undefined ? {} : { failed: result.failed }),
    ...(report === undefined
      ? {}
      : { error: { code: report.code, message: report.message, hint: report.hint } }),
  }
}

const resultLines = (result: ApplyResult): readonly string[] => {
  const report = result.cause === undefined ? undefined : toTrackerError(result.cause)
  return [
    `result: ${result.status}${result.dryRun ? " (dry run)" : ""}`,
    `changed: ${result.changed.length === 0 ? "none" : result.changed.join(", ")}`,
    ...(result.failed === undefined || report === undefined
      ? []
      : [
          `failed: ${result.failed.action} ${result.failed.target}: ${report.code}: ${report.message}`,
        ]),
  ]
}

const writeOutput = (issue: IssueReadDocument, result: ApplyResult): CommandOutput => {
  const report = result.cause === undefined ? undefined : toTrackerError(result.cause)
  return {
    kind: "resource",
    value: { issue, result: publicResult(result) },
    text: [formatReadDocument(issue), "", ...resultLines(result)],
    ...(report === undefined ? {} : { exitCode: exitCodeOf(report.code) }),
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
            new TrackerError({
              code: "internal",
              message: `The read of ${ref} returned no issue.`,
              hint: null,
            }),
          )
        : Effect.succeed(issue)
    }),
  )

export { applyResultShape, issueWriteShape, readIssue, writeOutput }
