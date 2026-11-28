import { Effect, Option } from "effect"
import { Argument, Flag } from "effect/cli"

import type { ApplyDocument } from "@/domain/apply"

import { classifyWriteError } from "@/cli/error-report"
import { resolveIssueContext } from "@/cli/issue/context"
import { issueWriteShape, postWriteRead, writeOutput } from "@/cli/issue/write-output"
import { dryRunFlag } from "@/cli/output"
import { defineCommand, selectOutput } from "@/cli/spec"
import { TrackerError } from "@/domain/error"
import { IssueApply } from "@/tracker/apply"
import { applyPlan, dryRunPlan } from "@/tracker/plan"

const emptyBody = () =>
  new TrackerError({
    code: "validation",
    message: "The comment body is empty.",
    hint: "Pass --body-file with the comment text, or - for standard input.",
  })

const commentSpec = defineCommand("comment", {
  summary: "Post one comment on an issue",
  examples: [
    {
      command: "printf 'Started work.' | rata issue comment RAT-42 --body-file -",
      description: "Post a comment from standard input",
    },
    {
      command: "rata issue comment RAT-42 --body-file note.md --dedupe-key handoff-42",
      description: "Post a comment that a retry cannot duplicate",
    },
  ],
  input: {
    ref: Argument.String("ref").pipe(
      Argument.withDescription("Issue reference: an identifier, a UUID, or a linear.app URL"),
    ),
    bodyFile: Flag.String("body-file").pipe(
      Flag.withDescription("Read the comment from a file. Use - for standard input"),
    ),
    dedupeKey: Flag.String("dedupe-key").pipe(
      Flag.withDescription("Stable key that makes a retry return skipped. Required"),
      Flag.optional,
    ),
    dryRun: dryRunFlag,
  },
  control: (input) => ({
    dryRun: input.dryRun,
    bodyFile: Option.some(input.bodyFile),
  }),
  output: selectOutput(issueWriteShape),
  run: (input, control) =>
    Effect.gen(function* commentOnIssue() {
      if (Option.isNone(control.body) || control.body.value.trim().length === 0) {
        return yield* emptyBody()
      }
      const dedupeKey = Option.getOrUndefined(input.dedupeKey)
      if (dedupeKey === undefined || dedupeKey.trim().length === 0) {
        return yield* new TrackerError({
          code: "validation",
          message: "The --dedupe-key flag is required.",
          hint: "Pass a stable key so a retry returns skipped instead of posting again.",
        })
      }
      const document: ApplyDocument = {
        comment: { body: control.body.value, dedupeKey },
      }
      const context = yield* resolveIssueContext({ viewer: true })
      const engine = yield* IssueApply
      const plan = yield* engine.plan(context, input.ref, document, { command: "comment" })
      const result = control.dryRun
        ? dryRunPlan(plan)
        : yield* applyPlan(plan, { classifyError: classifyWriteError })
      const outcome = yield* postWriteRead(input.ref, result)
      return writeOutput(outcome)
    }),
})

export { commentSpec }
