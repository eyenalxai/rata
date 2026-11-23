import { Effect, Option } from "effect"
import { Argument, Flag } from "effect/cli"

import { resolveIssueContext } from "@/cli/issue/context"
import { issueWriteShape, readIssue, writeOutput } from "@/cli/issue/write-output"
import { dryRunFlag } from "@/cli/output"
import { defineCommand, selectOutput } from "@/cli/spec"
import { applyPlan, dryRunPlan } from "@/tracker/plan"
import { IssueReader } from "@/tracker/read"
import { IssueWorkflow } from "@/tracker/workflow"

const closeSpec = defineCommand("close", {
  summary: "Close an issue and move it to a completed state",
  examples: [
    {
      command: "rata issue close RAT-42",
      description: "Close an issue",
    },
    {
      command: "echo 'Done in PR #12' | rata issue close RAT-42 --comment-file -",
      description: "Close an issue and post one comment",
    },
    {
      command: "rata issue close RAT-42 --force",
      description: "Close an issue that still has open children",
    },
  ],
  input: {
    ref: Argument.String("ref").pipe(
      Argument.withDescription("Issue reference: an identifier, a UUID, or a linear.app URL"),
    ),
    commentFile: Flag.String("comment-file").pipe(
      Flag.withDescription("Read the comment from a file. Use - for standard input"),
      Flag.optional,
    ),
    force: Flag.Boolean("force").pipe(
      Flag.withDescription("Close even when the issue has open children"),
      Flag.withDefault(false),
    ),
    dryRun: dryRunFlag,
  },
  control: (input) => ({ dryRun: input.dryRun, bodyFile: input.commentFile }),
  output: selectOutput(issueWriteShape),
  run: (input, control) =>
    Effect.gen(function* closeIssue() {
      const context = yield* resolveIssueContext({ viewer: true })
      const workflow = yield* IssueWorkflow
      const plan = yield* workflow.close(context, input.ref, {
        comment: Option.getOrUndefined(control.body),
        force: input.force,
      })
      const result = control.dryRun ? dryRunPlan(plan) : yield* applyPlan(plan)
      const reader = yield* IssueReader
      const issue = yield* readIssue(reader, input.ref).pipe(Effect.orElseSucceed(() => plan.issue))
      return writeOutput(issue, result)
    }),
})

export { closeSpec }
