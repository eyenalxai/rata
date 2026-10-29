import { Effect, Option } from "effect"
import { Argument, Command, Flag } from "effect/cli"

import type { BulkWriteResult, WriteAction } from "@/api/issue-write/model"

import { IssueWriteApi } from "@/api/issue-write"
import { writeBulkResults } from "@/cli/bulk"
import { OutputFields, rejectFields } from "@/cli/fields"
import {
  JsonOutput,
  dryRunFlag,
  errorLine,
  reportFailure,
  writeDryRun,
  writeJson,
  writeLine,
} from "@/cli/output"

const valueArgument = Argument.String("value").pipe(
  Argument.withDescription(
    "Without --parent: the issue reference, then the label names. With --parent: the label names",
  ),
  Argument.variadic({ min: 0 }),
)

const parentFlag = Flag.String("parent").pipe(
  Flag.withDescription("Apply to every child of this issue, open and closed"),
  Flag.optional,
)

type LabelTarget =
  | {
      readonly kind: "single"
      readonly ref: string
      readonly labels: readonly string[]
    }
  | {
      readonly kind: "bulk"
      readonly parent: string
      readonly labels: readonly string[]
    }

type LabelTargetParse =
  | { readonly ok: true; readonly target: LabelTarget }
  | { readonly ok: false; readonly message: string; readonly hint: string }

const parseLabelTarget = (
  command: "add" | "remove",
  parent: string | undefined,
  values: readonly string[],
): LabelTargetParse => {
  if (parent !== undefined) {
    if (values.length === 0) {
      return {
        ok: false,
        message: "At least one label is required.",
        hint: `rata issue label ${command} --parent <ref> <label...>`,
      }
    }
    return { ok: true, target: { kind: "bulk", parent, labels: values } }
  }
  const [ref, ...labels] = values
  if (ref === undefined) {
    return {
      ok: false,
      message: "The issue reference is required.",
      hint: `rata issue label ${command} <ref> <label...>`,
    }
  }
  if (labels.length === 0) {
    return {
      ok: false,
      message: "At least one label is required.",
      hint: `rata issue label ${command} ${ref} <label...>`,
    }
  }
  return { ok: true, target: { kind: "single", ref, labels } }
}

const labelOf = (action: WriteAction): string =>
  typeof action.changes.label === "string" ? action.changes.label : ""

const changedLabels = (actions: readonly WriteAction[], status: WriteAction["status"]): string[] =>
  actions.filter((action) => action.status === status).map(labelOf)

const noChange = (result: { readonly status: string }): string =>
  result.status === "skipped" ? " (no change)" : ""

const bulkLine =
  (command: "add" | "remove", dryRun: boolean) =>
  (result: BulkWriteResult): string => {
    const labels = (result.labels ?? []).join(", ")
    if (dryRun) {
      return command === "add"
        ? `Would add ${labels} to ${result.identifier}.${noChange(result)}`
        : `Would remove ${labels} from ${result.identifier}.${noChange(result)}`
    }
    if (command === "add") {
      return result.status === "skipped"
        ? `${result.identifier} already has ${labels}.`
        : `Added ${labels} to ${result.identifier}.`
    }
    return result.status === "skipped"
      ? `${result.identifier} does not have ${labels}.`
      : `Removed ${labels} from ${result.identifier}.`
  }

const addCommand = Command.make(
  "add",
  { value: valueArgument, parent: parentFlag, dryRun: dryRunFlag },
  (config) =>
    Effect.gen(function* addLabels() {
      const json = yield* JsonOutput
      yield* rejectFields(yield* OutputFields)
      const parsed = parseLabelTarget("add", Option.getOrUndefined(config.parent), config.value)
      if (!parsed.ok) {
        return yield* errorLine(1, parsed.message, parsed.hint)
      }
      const target = parsed.target
      const api = yield* IssueWriteApi
      if (target.kind === "bulk") {
        const results = yield* api.addLabelsToChildren(target.parent, target.labels, {
          dryRun: config.dryRun,
        })
        return yield* writeBulkResults(json, config.dryRun, results, bulkLine("add", config.dryRun))
      }
      const result = yield* api.addLabels(target.ref, target.labels, { dryRun: config.dryRun })
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
  Command.withDescription("Add labels to an issue or to every child of a parent issue"),
  Command.withExamples([
    {
      command: "rata issue label add RAT-42 ready-for-agent bug",
      description: "Add two labels to an issue",
    },
    {
      command: "rata issue label add --parent RAT-1 ready-for-agent",
      description: "Add a label to every child of an issue",
    },
    {
      command: "rata issue label add RAT-42 ready-for-agent --dry-run",
      description: "Preview the labels without writing",
    },
  ]),
)

const removeCommand = Command.make(
  "remove",
  { value: valueArgument, parent: parentFlag, dryRun: dryRunFlag },
  (config) =>
    Effect.gen(function* removeLabels() {
      const json = yield* JsonOutput
      yield* rejectFields(yield* OutputFields)
      const parsed = parseLabelTarget("remove", Option.getOrUndefined(config.parent), config.value)
      if (!parsed.ok) {
        return yield* errorLine(1, parsed.message, parsed.hint)
      }
      const target = parsed.target
      const api = yield* IssueWriteApi
      if (target.kind === "bulk") {
        const results = yield* api.removeLabelsFromChildren(target.parent, target.labels, {
          dryRun: config.dryRun,
        })
        return yield* writeBulkResults(
          json,
          config.dryRun,
          results,
          bulkLine("remove", config.dryRun),
        )
      }
      const result = yield* api.removeLabels(target.ref, target.labels, {
        dryRun: config.dryRun,
      })
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
  Command.withDescription("Remove labels from an issue or from every child of a parent issue"),
  Command.withExamples([
    {
      command: "rata issue label remove RAT-42 needs-triage",
      description: "Remove the triage label from an issue",
    },
    {
      command: "rata issue label remove --parent RAT-1 needs-triage",
      description: "Remove a label from every child of an issue",
    },
  ]),
)

const issueLabelCommand = Command.make("label").pipe(
  Command.withDescription("Add or remove the labels of an issue"),
  Command.withSubcommands([addCommand, removeCommand]),
  Command.withGlobalFlags([JsonOutput, OutputFields]),
)

export { issueLabelCommand, parseLabelTarget }
