import { Effect } from "effect"
import { Argument, Flag } from "effect/cli"

import type { ApplyDocument, ApplyRelations } from "@/domain/apply"

import { resolveIssueContext } from "@/cli/issue/context"
import { issueWriteShape, readIssue, writeOutput } from "@/cli/issue/write-output"
import { dryRunFlag } from "@/cli/output"
import { defineCommand, selectOutput } from "@/cli/spec"
import { TrackerError } from "@/domain/error"
import { IssueApply } from "@/tracker/apply"
import { applyPlan, dryRunPlan } from "@/tracker/plan"
import { IssueReader } from "@/tracker/read"

type RelationFlag = keyof ApplyRelations

const repeatableRef = (name: string, description: string) =>
  Flag.atLeast(Flag.String(name), 0).pipe(Flag.withDescription(description))

const relationFlags = {
  blocks: repeatableRef("blocks", "Issue that waits for this one. Repeat for more"),
  blockedBy: repeatableRef("blocked-by", "Issue that this one waits for. Repeat for more"),
  related: repeatableRef("related", "Related issue. Repeat for more"),
  duplicate: repeatableRef("duplicate", "Issue that this one duplicates. Repeat for more"),
} as const

const missingRelationFlag = () =>
  new TrackerError({
    code: "validation",
    message: "Pass one of --blocks, --blocked-by, --related or --duplicate.",
    hint: "rata issue relate RAT-42 --blocks RAT-41",
  })

const manyRelationFlags = () =>
  new TrackerError({
    code: "validation",
    message: "Pass one relation flag per call.",
    hint: "Run one relate call for each relation kind.",
  })

const relationDocument = (relations: ApplyRelations): ApplyDocument => ({ relations })

const relateSpec = defineCommand("relate", {
  summary: "Add or remove relation edges on an issue",
  examples: [
    {
      command: "rata issue relate RAT-42 --blocked-by RAT-41",
      description: "Make RAT-42 wait for RAT-41",
    },
    {
      command: "rata issue relate RAT-42 --blocks RAT-41 RAT-40",
      description: "Make two issues wait for RAT-42",
    },
    {
      command: "rata issue relate RAT-42 --related RAT-41 --remove",
      description: "Remove the relation from both issues",
    },
  ],
  input: {
    ref: Argument.String("ref").pipe(
      Argument.withDescription("Issue reference: an identifier, a UUID, or a linear.app URL"),
    ),
    ...relationFlags,
    remove: Flag.Boolean("remove").pipe(
      Flag.withDescription("Remove the named relation edges instead of adding them"),
      Flag.withDefault(false),
    ),
    dryRun: dryRunFlag,
  },
  control: (input) => ({ dryRun: input.dryRun }),
  output: selectOutput(issueWriteShape),
  run: (input, control) =>
    Effect.gen(function* relateIssue() {
      const groups = (
        [
          ["blocks", input.blocks],
          ["blockedBy", input.blockedBy],
          ["related", input.related],
          ["duplicate", input.duplicate],
        ] as const satisfies readonly (readonly [RelationFlag, readonly string[]])[]
      ).filter(([, values]) => values.length > 0)
      if (groups.length === 0) {
        return yield* missingRelationFlag()
      }
      if (groups.length > 1) {
        return yield* manyRelationFlags()
      }
      const [group] = groups
      if (group === undefined) {
        return yield* missingRelationFlag()
      }
      const [kind, values] = group
      const relations: ApplyRelations = { [kind]: values }
      const context = yield* resolveIssueContext({ viewer: true })
      const engine = yield* IssueApply
      const plan = yield* engine.plan(context, input.ref, relationDocument(relations), {
        command: "relate",
        removeRelations: input.remove,
      })
      const result = control.dryRun ? dryRunPlan(plan) : yield* applyPlan(plan)
      const reader = yield* IssueReader
      const issue = yield* readIssue(reader, input.ref)
      return writeOutput(issue, result)
    }),
})

export { relateSpec }
