import { Effect, Option } from "effect"
import { Argument, Flag } from "effect/cli"

import { resolveIssueContext } from "@/cli/issue/context"
import { decodeApplyDocument, emptyApplyDocument, requireDedupeKey } from "@/cli/issue/document"
import { issueWriteShape, postWriteRead, writeOutput } from "@/cli/issue/write-output"
import { dryRunFlag } from "@/cli/output"
import { defineCommand, selectOutput } from "@/cli/spec"
import { IssueApply } from "@/tracker/apply"
import { applyPlan, checkSnapshot, dryRunPlan } from "@/tracker/plan"

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
        return yield* emptyApplyDocument()
      }
      const document = yield* decodeApplyDocument(control.body.value)
      yield* requireDedupeKey(document)
      const context = yield* resolveIssueContext({ viewer: true })
      const engine = yield* IssueApply
      const plan = yield* engine.plan(context, input.ref, document)
      const ifUnchanged = Option.getOrUndefined(control.ifUnchanged)
      const result = control.dryRun
        ? yield* checkSnapshot(plan, ifUnchanged).pipe(Effect.as(dryRunPlan(plan)))
        : yield* applyPlan(plan, { ifUnchanged })
      const outcome = yield* postWriteRead(input.ref, result)
      return writeOutput(outcome)
    }),
})

export { applySpec }
