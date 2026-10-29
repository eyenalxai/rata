import { Effect } from "effect"
import { Argument, Command } from "effect/cli"

import type { WriteAction } from "@/api/issue-write/model"

import { IssueWriteApi } from "@/api/issue-write"
import { OutputFields, rejectFields } from "@/cli/fields"
import {
  JsonOutput,
  dryRunFlag,
  reportFailure,
  writeDryRun,
  writeJson,
  writeLine,
} from "@/cli/output"

const refArgument = Argument.String("ref").pipe(
  Argument.withDescription("Issue reference: an identifier, a UUID, or a linear.app URL"),
)

const labelArgument = Argument.String("label").pipe(
  Argument.withDescription("Label name. The triage roles are label names"),
  Argument.variadic({ min: 1 }),
)

const labelOf = (action: WriteAction): string =>
  typeof action.changes.label === "string" ? action.changes.label : ""

const changedLabels = (actions: readonly WriteAction[], status: WriteAction["status"]): string[] =>
  actions.filter((action) => action.status === status).map(labelOf)

const noChange = (action: WriteAction): string =>
  action.status === "skipped" ? " (no change)" : ""

const addCommand = Command.make(
  "add",
  { ref: refArgument, label: labelArgument, dryRun: dryRunFlag },
  (config) =>
    Effect.gen(function* addLabels() {
      const json = yield* JsonOutput
      yield* rejectFields(yield* OutputFields)
      const api = yield* IssueWriteApi
      const result = yield* api.addLabels(config.ref, config.label, { dryRun: config.dryRun })
      if (config.dryRun) {
        return yield* writeDryRun(
          json,
          result.actions,
          (action) => `Would add ${labelOf(action)} to ${action.target}.${noChange(action)}`,
        )
      }
      if (json) {
        return yield* writeJson({ dryRun: false, status: result.status, issue: result.issue })
      }
      const added = changedLabels(result.actions, "updated")
      const skipped = changedLabels(result.actions, "skipped")
      if (added.length > 0) {
        yield* writeLine(`Added ${added.join(", ")} to ${result.issue.identifier}.`)
      }
      if (skipped.length > 0) {
        yield* writeLine(`${result.issue.identifier} already has ${skipped.join(", ")}.`)
      }
      return yield* Effect.void
    }).pipe(Effect.catch(reportFailure)),
).pipe(
  Command.withDescription("Add labels to an issue"),
  Command.withExamples([
    {
      command: "rata issue label add RAT-42 ready-for-agent bug",
      description: "Add two labels to an issue",
    },
    {
      command: "rata issue label add RAT-42 ready-for-agent --dry-run",
      description: "Preview the labels without writing",
    },
  ]),
)

const removeCommand = Command.make(
  "remove",
  { ref: refArgument, label: labelArgument, dryRun: dryRunFlag },
  (config) =>
    Effect.gen(function* removeLabels() {
      const json = yield* JsonOutput
      yield* rejectFields(yield* OutputFields)
      const api = yield* IssueWriteApi
      const result = yield* api.removeLabels(config.ref, config.label, { dryRun: config.dryRun })
      if (config.dryRun) {
        return yield* writeDryRun(
          json,
          result.actions,
          (action) => `Would remove ${labelOf(action)} from ${action.target}.${noChange(action)}`,
        )
      }
      if (json) {
        return yield* writeJson({ dryRun: false, status: result.status, issue: result.issue })
      }
      const removed = changedLabels(result.actions, "updated")
      const skipped = changedLabels(result.actions, "skipped")
      if (removed.length > 0) {
        yield* writeLine(`Removed ${removed.join(", ")} from ${result.issue.identifier}.`)
      }
      if (skipped.length > 0) {
        yield* writeLine(`${result.issue.identifier} does not have ${skipped.join(", ")}.`)
      }
      return yield* Effect.void
    }).pipe(Effect.catch(reportFailure)),
).pipe(
  Command.withDescription("Remove labels from an issue"),
  Command.withExamples([
    {
      command: "rata issue label remove RAT-42 needs-triage",
      description: "Remove the triage label from an issue",
    },
  ]),
)

const issueLabelCommand = Command.make("label").pipe(
  Command.withDescription("Add or remove the labels of an issue"),
  Command.withSubcommands([addCommand, removeCommand]),
  Command.withGlobalFlags([JsonOutput, OutputFields]),
)

export { issueLabelCommand }
