import { Effect } from "effect"
import { Argument, Command, Flag } from "effect/cli"

import type {
  IssueRelationChange,
  IssueRelationChanges,
  RelationKind,
} from "@/api/issue-write-model"

import { IssueWriteApi } from "@/api/issue-write"
import { errorLine, reportFailure, writeJson, writeLine } from "@/cli/output"

const jsonFlag = Flag.Boolean("json").pipe(
  Flag.withDescription("Print machine-readable JSON"),
  Flag.withDefault(false),
)

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

const kindLabel = (kind: RelationKind): string => {
  if (kind === "blocks") {
    return "blocks"
  }
  if (kind === "blockedBy") {
    return "blocked by"
  }
  if (kind === "related") {
    return "related to"
  }
  return "duplicates"
}

const formatChanges = (
  verb: string,
  ref: string,
  changes: readonly IssueRelationChange[],
): string => {
  const parts = changes.map((change) => `${kindLabel(change.kind)} ${change.target}`)
  return `${verb} ${ref}: ${parts.join(", ")}.`
}

const linkCommand = Command.make(
  "link",
  { ref: refArgument, ...relationFlags, json: jsonFlag },
  (config) =>
    Effect.gen(function* linkIssue() {
      const changes: IssueRelationChanges = config
      if (countChanges(changes) === 0) {
        return yield* errorLine(
          1,
          "Pass at least one of --blocks, --blocked-by, --related or --duplicate.",
        )
      }
      const api = yield* IssueWriteApi
      const applied = yield* api.link(config.ref, changes)
      if (config.json) {
        return yield* writeJson({ relations: applied })
      }
      return yield* writeLine(formatChanges("Linked", config.ref, applied))
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
  { ref: refArgument, ...relationFlags, json: jsonFlag },
  (config) =>
    Effect.gen(function* unlinkIssue() {
      const changes: IssueRelationChanges = config
      if (countChanges(changes) === 0) {
        return yield* errorLine(
          1,
          "Pass at least one of --blocks, --blocked-by, --related or --duplicate.",
        )
      }
      const api = yield* IssueWriteApi
      const applied = yield* api.unlink(config.ref, changes)
      if (config.json) {
        return yield* writeJson({ relations: applied })
      }
      return yield* writeLine(formatChanges("Unlinked", config.ref, applied))
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
