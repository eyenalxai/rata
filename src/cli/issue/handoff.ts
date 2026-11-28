import { Effect, Option } from "effect"
import { Argument, Flag } from "effect/cli"

import { classifyWriteError } from "@/cli/error-report"
import { resolveIssueContext } from "@/cli/issue/context"
import { decodeHandoffDocument, emptyHandoffDocument, requireDedupeKey } from "@/cli/issue/document"
import { issueWriteShape, postWriteRead, writeOutput } from "@/cli/issue/write-output"
import { dryRunFlag } from "@/cli/output"
import { defineCommand, selectOutput } from "@/cli/spec"
import { applyPlan, dryRunPlan } from "@/tracker/plan"
import { IssueWorkflow } from "@/tracker/workflow"

const handoffSpec = defineCommand("handoff", {
  summary: "Attach a pull request, apply fields, sections and one comment",
  examples: [
    {
      command: "rata issue handoff RAT-42 --file - < handoff.json",
      description: "Attach the PR, move the state, append a section and post one comment",
    },
    {
      command: "rata issue handoff RAT-42 --file handoff.json --dry-run",
      description: "Print the plan and write nothing",
    },
  ],
  input: {
    ref: Argument.String("ref").pipe(
      Argument.withDescription("Issue reference: an identifier, a UUID, or a linear.app URL"),
    ),
    file: Flag.String("file").pipe(
      Flag.withDescription("Read the handoff document from a file. Use - for standard input"),
    ),
    dryRun: dryRunFlag,
  },
  control: (input) => ({ dryRun: input.dryRun, bodyFile: Option.some(input.file) }),
  output: selectOutput(issueWriteShape),
  run: (input, control) =>
    Effect.gen(function* handoffIssue() {
      if (Option.isNone(control.body)) {
        return yield* emptyHandoffDocument()
      }
      const decoded = yield* decodeHandoffDocument(control.body.value)
      yield* requireDedupeKey(decoded)
      const { pr, ...document } = decoded
      const context = yield* resolveIssueContext({ viewer: true })
      const workflow = yield* IssueWorkflow
      const plan = yield* workflow.handoff(context, input.ref, document, pr)
      const result = control.dryRun
        ? dryRunPlan(plan)
        : yield* applyPlan(plan, { classifyError: classifyWriteError })
      const outcome = yield* postWriteRead(input.ref, result)
      return writeOutput(outcome)
    }),
})

export { handoffSpec }
