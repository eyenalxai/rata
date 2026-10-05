import { Effect } from "effect"
import { Argument, Command, Flag } from "effect/cli"

import { IssueWriteApi } from "@/api/issue-write"
import { reportFailure, writeJson, writeLine } from "@/cli/output"

const jsonFlag = Flag.Boolean("json").pipe(
  Flag.withDescription("Print machine-readable JSON"),
  Flag.withDefault(false),
)

const refArgument = Argument.String("ref").pipe(
  Argument.withDescription("Issue reference: an identifier, a UUID, or a linear.app URL"),
)

const labelArgument = Argument.String("label").pipe(
  Argument.withDescription("Label name. The triage roles are label names"),
  Argument.variadic({ min: 1 }),
)

const addCommand = Command.make(
  "add",
  { ref: refArgument, label: labelArgument, json: jsonFlag },
  (config) =>
    Effect.gen(function* addLabels() {
      const api = yield* IssueWriteApi
      const issue = yield* api.addLabels(config.ref, config.label)
      if (config.json) {
        return yield* writeJson({ issue })
      }
      return yield* writeLine(`Added ${config.label.join(", ")} to ${issue.identifier}.`)
    }).pipe(Effect.catch(reportFailure)),
).pipe(
  Command.withDescription("Add labels to an issue"),
  Command.withExamples([
    {
      command: "rata issue label add RAT-42 ready-for-agent bug",
      description: "Add two labels to an issue",
    },
  ]),
)

const removeCommand = Command.make(
  "remove",
  { ref: refArgument, label: labelArgument, json: jsonFlag },
  (config) =>
    Effect.gen(function* removeLabels() {
      const api = yield* IssueWriteApi
      const issue = yield* api.removeLabels(config.ref, config.label)
      if (config.json) {
        return yield* writeJson({ issue })
      }
      return yield* writeLine(`Removed ${config.label.join(", ")} from ${issue.identifier}.`)
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
)

export { issueLabelCommand }
