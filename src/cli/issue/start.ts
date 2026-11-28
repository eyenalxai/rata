import { Effect, Option } from "effect"
import { Argument, Flag } from "effect/cli"

import { classifyWriteError } from "@/cli/error-report"
import { resolveIssueContext } from "@/cli/issue/context"
import { issueWriteShape, postWriteRead, writeOutput } from "@/cli/issue/write-output"
import { dryRunFlag } from "@/cli/output"
import { defineCommand, selectOutput } from "@/cli/spec"
import { applyPlan, dryRunPlan } from "@/tracker/plan"
import { IssueWorkflow } from "@/tracker/workflow"

const startSpec = defineCommand("start", {
  summary: "Claim an issue and move it to a started state",
  examples: [
    {
      command: "rata issue start RAT-42",
      description: "Claim an unassigned issue and start it",
    },
    {
      command: "rata issue start RAT-42 --take",
      description: "Take an issue from another user and start it",
    },
    {
      command: "rata issue start RAT-42 --state 'In Review'",
      description: "Move the issue to a named state",
    },
  ],
  input: {
    ref: Argument.String("ref").pipe(
      Argument.withDescription("Issue reference: an identifier, a UUID, or a linear.app URL"),
    ),
    state: Flag.String("state").pipe(
      Flag.withDescription("Workflow state name. Defaults to the first started state"),
      Flag.optional,
    ),
    take: Flag.Boolean("take").pipe(
      Flag.withDescription("Reassign an issue held by another user"),
      Flag.withDefault(false),
    ),
    dryRun: dryRunFlag,
  },
  control: (input) => ({ dryRun: input.dryRun }),
  output: selectOutput(issueWriteShape),
  run: (input, control) =>
    Effect.gen(function* startIssue() {
      const context = yield* resolveIssueContext({ viewer: true })
      const workflow = yield* IssueWorkflow
      const plan = yield* workflow.start(context, input.ref, {
        state: Option.getOrUndefined(input.state),
        take: input.take,
      })
      const result = control.dryRun
        ? dryRunPlan(plan)
        : yield* applyPlan(plan, { classifyError: classifyWriteError })
      const outcome = yield* postWriteRead(input.ref, result)
      return writeOutput(outcome)
    }),
})

export { startSpec }
