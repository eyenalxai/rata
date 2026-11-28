import { Effect, Option } from "effect"
import { Flag } from "effect/cli"

import { resolveIssueContext } from "@/cli/issue/context"
import { decodePublishDocument, emptyPublishDocument } from "@/cli/issue/document"
import { publishOutput, publishShape } from "@/cli/issue/publish/output"
import { dryRunFlag } from "@/cli/output"
import { defineCommand, selectOutput } from "@/cli/spec"
import { IssuePublish } from "@/tracker/publish"

const publishSpec = defineCommand("publish", {
  summary: "Create a graph of issues and blocking edges from one document",
  examples: [
    {
      command: "rata issue publish --file graph.json",
      description: "Create a parent, its children and their blocking edges",
    },
    {
      command: "rata issue publish --file - --dry-run < graph.json",
      description: "Print the resolved order, parents and edge plan without writing",
    },
    {
      command: "rata issue publish --file graph.json --dry-run",
      description: "Check a retry before it creates or links anything",
    },
  ],
  input: {
    file: Flag.String("file").pipe(
      Flag.withDescription("Read the publish document from a file. Use - for standard input"),
    ),
    dryRun: dryRunFlag,
  },
  control: (input) => ({ dryRun: input.dryRun, bodyFile: Option.some(input.file) }),
  output: selectOutput(publishShape),
  run: (_input, control) =>
    Effect.gen(function* publishGraph() {
      if (Option.isNone(control.body)) {
        return yield* emptyPublishDocument()
      }
      const document = yield* decodePublishDocument(control.body.value)
      const context = yield* resolveIssueContext({ viewer: true })
      const publisher = yield* IssuePublish
      const plan = yield* publisher.plan(context, document)
      const result = control.dryRun ? publisher.dryRun(plan) : yield* publisher.execute(plan)
      return publishOutput(result)
    }),
})

export { publishSpec }
