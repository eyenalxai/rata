import { Effect } from "effect"
import { Argument, Command, Flag } from "effect/cli"

import type {
  IssueRelationChange,
  IssueRelationChanges,
  RelationKind,
  WriteAction,
} from "@/api/issue-write/model"

import { IssueWriteApi } from "@/api/issue-write"
import { relationKindInfo } from "@/api/issue-write/model"
import { OutputFields, rejectFields } from "@/cli/fields"
import {
  JsonOutput,
  dryRunFlag,
  errorLine,
  noChange,
  reportFailure,
  writeDryRun,
  writeJson,
  writeLine,
} from "@/cli/output"

const refArgument = Argument.String("ref").pipe(
  Argument.withDescription("Issue reference: an identifier, a UUID, or a linear.app URL"),
)

const repeatableRef = (name: string, description: string) =>
  Flag.atLeast(Flag.String(name), 0).pipe(Flag.withDescription(description))

const relationFlags = {
  blocks: repeatableRef("blocks", "Issue that waits for this one. Repeat for more"),
  blockedBy: repeatableRef("blocked-by", "Issue that this one waits for. Repeat for more"),
  related: repeatableRef("related", "Related issue. Repeat for more"),
  duplicate: repeatableRef("duplicate", "Issue that this one duplicates. Repeat for more"),
}

const countChanges = (changes: IssueRelationChanges): number =>
  changes.blocks.length +
  changes.blockedBy.length +
  changes.related.length +
  changes.duplicate.length

const kindLabel = (kind: RelationKind): string => relationKindInfo[kind].label

const formatChanges = (
  verb: string,
  ref: string,
  changes: readonly IssueRelationChange[],
): string => {
  const parts = changes.map((change) => `${kindLabel(change.kind)} ${change.target}`)
  return `${verb} ${ref}: ${parts.join(", ")}.`
}

const relationOf = (action: WriteAction): { kind: RelationKind; issue: string } => {
  const relation = action.changes.relation
  const issue = action.changes.issue
  const kind: RelationKind =
    relation === "blocks" ||
    relation === "blockedBy" ||
    relation === "related" ||
    relation === "duplicate"
      ? relation
      : "related"
  return {
    kind,
    issue: typeof issue === "string" ? issue : "",
  }
}

const linkCommand = Command.make(
  "link",
  { ref: refArgument, ...relationFlags, dryRun: dryRunFlag },
  (config) =>
    Effect.gen(function* linkIssue() {
      const json = yield* JsonOutput
      yield* rejectFields(yield* OutputFields)
      const changes: IssueRelationChanges = config
      if (countChanges(changes) === 0) {
        return yield* errorLine(
          "validation",
          "Pass at least one of --blocks, --blocked-by, --related or --duplicate.",
        )
      }
      const api = yield* IssueWriteApi
      const result = yield* api.link(config.ref, changes, { dryRun: config.dryRun })
      if (config.dryRun) {
        return yield* writeDryRun(json, result.actions, (action) => {
          const relation = relationOf(action)
          return `Would link ${action.target}: ${kindLabel(relation.kind)} ${relation.issue}.${noChange(action)}`
        })
      }
      if (json) {
        return yield* writeJson({
          dryRun: false,
          status: result.status,
          relations: result.changes,
        })
      }
      const applied = result.changes.filter((change) => change.action !== "skipped")
      const skipped = result.changes.filter((change) => change.action === "skipped")
      if (applied.length > 0) {
        yield* writeLine(formatChanges("Linked", config.ref, applied))
      }
      for (const change of skipped) {
        yield* writeLine(
          `Skipped ${config.ref}: ${kindLabel(change.kind)} ${change.target} is already linked.`,
        )
      }
      return yield* Effect.void
    }).pipe(Effect.catch(reportFailure)),
).pipe(
  Command.withDescription("Create relations between issues"),
  Command.withExamples([
    {
      command: "rata issue link RAT-43 --blocked-by RAT-42",
      description: "Record that RAT-43 waits for RAT-42",
    },
    {
      command: "rata issue link RAT-42 --blocks RAT-43 --related RAT-44",
      description: "Record that RAT-42 blocks RAT-43 and is related to RAT-44",
    },
  ]),
)

const unlinkCommand = Command.make(
  "unlink",
  { ref: refArgument, ...relationFlags, dryRun: dryRunFlag },
  (config) =>
    Effect.gen(function* unlinkIssue() {
      const json = yield* JsonOutput
      yield* rejectFields(yield* OutputFields)
      const changes: IssueRelationChanges = config
      if (countChanges(changes) === 0) {
        return yield* errorLine(
          "validation",
          "Pass at least one of --blocks, --blocked-by, --related or --duplicate.",
        )
      }
      const api = yield* IssueWriteApi
      const result = yield* api.unlink(config.ref, changes, { dryRun: config.dryRun })
      if (config.dryRun) {
        return yield* writeDryRun(json, result.actions, (action) => {
          const relation = relationOf(action)
          return `Would unlink ${action.target}: ${kindLabel(relation.kind)} ${relation.issue}.${noChange(action)}`
        })
      }
      if (json) {
        return yield* writeJson({
          dryRun: false,
          status: result.status,
          relations: result.changes,
        })
      }
      const applied = result.changes.filter((change) => change.action !== "skipped")
      const skipped = result.changes.filter((change) => change.action === "skipped")
      if (applied.length > 0) {
        yield* writeLine(formatChanges("Unlinked", config.ref, applied))
      }
      for (const change of skipped) {
        yield* writeLine(
          `Skipped ${config.ref}: ${kindLabel(change.kind)} ${change.target} is not linked.`,
        )
      }
      return yield* Effect.void
    }).pipe(Effect.catch(reportFailure)),
).pipe(
  Command.withDescription("Remove relations between issues"),
  Command.withExamples([
    {
      command: "rata issue unlink RAT-43 --blocked-by RAT-42",
      description: "Remove the blocking edge between two issues",
    },
  ]),
)

export { linkCommand, unlinkCommand }
