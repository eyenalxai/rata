import { Effect, Option, Schema, SchemaIssue } from "effect"
import { Argument, Flag } from "effect/cli"

import type { ApplyDocument } from "@/domain/apply"

import { resolveIssueContext } from "@/cli/issue/context"
import { issueWriteShape, readIssue, writeOutput } from "@/cli/issue/write-output"
import { dryRunFlag } from "@/cli/output"
import { defineCommand, selectOutput } from "@/cli/spec"
import { ApplyDocumentJson } from "@/domain/apply"
import { TrackerError } from "@/domain/error"
import { IssueApply } from "@/tracker/apply"
import { applyPlan, dryRunPlan } from "@/tracker/plan"
import { IssueReader } from "@/tracker/read"

const formatIssue = SchemaIssue.makeFormatterDefault()

const emptyDocument = () =>
  new TrackerError({
    code: "validation",
    message: "The apply document is empty.",
    hint: "Pass one JSON object with fields, labels, sections, comment or relations.",
  })

const decodeDocument = (text: string): Effect.Effect<ApplyDocument, TrackerError> => {
  const decoded = Schema.decodeUnknownResult(ApplyDocumentJson, {
    onExcessProperty: "error",
  })(text)
  if (decoded._tag === "Success") {
    return Effect.succeed(decoded.success)
  }
  return Effect.fail(
    new TrackerError({
      code: "validation",
      message: `The apply document is invalid: ${formatIssue(decoded.failure.issue)}`,
      hint: "Pass one JSON object with fields, labels, sections, comment or relations.",
    }),
  )
}

const requireDedupeKey = (document: ApplyDocument): Effect.Effect<void, TrackerError> => {
  const comment = document.comment
  if (comment === undefined) {
    return Effect.void
  }
  if (comment.dedupeKey === undefined || comment.dedupeKey.trim().length === 0) {
    return Effect.fail(
      new TrackerError({
        code: "validation",
        message: "The apply comment needs a dedupeKey.",
        hint: "Set comment.dedupeKey to a stable string so a retry is safe.",
      }),
    )
  }
  return Effect.void
}

const applySpec = defineCommand("apply", {
  summary: "Apply one document to fields, labels, sections, a comment and relations",
  examples: [
    {
      command: "rata issue apply RAT-42 --file - < update.json",
      description: "Apply fields, labels, sections, a comment and relations in one call",
    },
    {
      command: "rata issue apply RAT-42 --file update.json --dry-run",
      description: "Print the plan and write nothing",
    },
    {
      command: "rata issue apply RAT-42 --file update.json --if-unchanged <snapshot>",
      description: "Apply only when the issue still matches the snapshot",
    },
  ],
  input: {
    ref: Argument.String("ref").pipe(
      Argument.withDescription("Issue reference: an identifier, a UUID, or a linear.app URL"),
    ),
    file: Flag.String("file").pipe(
      Flag.withDescription("Read the apply document from a file. Use - for standard input"),
    ),
    ifUnchanged: Flag.String("if-unchanged").pipe(
      Flag.withDescription("Fail with a conflict when the issue snapshot changed"),
      Flag.optional,
    ),
    dryRun: dryRunFlag,
  },
  control: (input) => ({
    dryRun: input.dryRun,
    ifUnchanged: input.ifUnchanged,
    bodyFile: Option.some(input.file),
  }),
  output: selectOutput(issueWriteShape),
  run: (input, control) =>
    Effect.gen(function* applyIssue() {
      if (Option.isNone(control.body)) {
        return yield* emptyDocument()
      }
      const document = yield* decodeDocument(control.body.value)
      yield* requireDedupeKey(document)
      const context = yield* resolveIssueContext({ viewer: true })
      const engine = yield* IssueApply
      const plan = yield* engine.plan(context, input.ref, document)
      const result = control.dryRun
        ? dryRunPlan(plan)
        : yield* applyPlan(plan, { ifUnchanged: Option.getOrUndefined(control.ifUnchanged) })
      const reader = yield* IssueReader
      const issue = yield* readIssue(reader, input.ref)
      return writeOutput(issue, result)
    }),
})

export { applySpec }
