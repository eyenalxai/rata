import { Effect, Option } from "effect"
import { Command, Flag } from "effect/cli"

import type { PlanAction } from "@/cli/output"

import { OutputFields, readFields, rejectFields, selectObject } from "@/cli/fields"
import {
  JsonOutput,
  dryRunFlag,
  errorLine,
  reportFailure,
  writeDryRun,
  writeJson,
  writeLine,
} from "@/cli/output"
import { resolvePriority } from "@/cli/priority"
import { defaultsDocument, formatDefaults, IssueDefaultsService } from "@/config/defaults"
import { currentDirectory } from "@/config/repo"
import { RepositoryIdentity } from "@/config/repo-identity"

const optionalText = (name: string, description: string) =>
  Flag.String(name).pipe(Flag.withDescription(description), Flag.optional)

const assigneeFlag = optionalText("assignee", "Default assignee: `me`, a user id, or `none`")
const labelFlag = Flag.String("label").pipe(
  Flag.atLeast(1),
  Flag.optional,
  Flag.withDescription("Default label name. Repeat to replace the list"),
)
const priorityFlag = optionalText(
  "priority",
  "Default priority: none, urgent, high, medium, low, or 0-4",
)

const configAction = (
  action: "config-set" | "config-unset",
  target: string,
  document: ReturnType<typeof defaultsDocument>,
): PlanAction => ({
  action,
  target,
  changes: document,
})

const repositoryRoot = Effect.fn("Cli.Config.repositoryRoot")(function* repositoryRootEffect() {
  const identity = yield* RepositoryIdentity
  const location = yield* identity.locate(yield* currentDirectory)
  return location.root
})

const showCommand = Command.make("show", {}, () =>
  Effect.gen(function* showDefaults() {
    const json = yield* JsonOutput
    const fields = yield* readFields(json, yield* OutputFields)
    const service = yield* IssueDefaultsService
    const document = defaultsDocument(yield* service.show)
    if (json) {
      return yield* writeJson({ defaults: yield* selectObject(fields, document) })
    }
    return yield* writeLine(`defaults: ${formatDefaults(document)}`)
  }).pipe(Effect.catch(reportFailure)),
).pipe(
  Command.withDescription("Show the issue defaults of this repository"),
  Command.withExamples([
    {
      command: "rata config show",
      description: "Show the defaults of this repository",
    },
    {
      command: "rata config show --json --fields assignee,labels",
      description: "Read the defaults for an agent",
    },
  ]),
)

const setCommand = Command.make(
  "set",
  {
    assignee: assigneeFlag,
    label: labelFlag,
    priority: priorityFlag,
    dryRun: dryRunFlag,
  },
  (config) =>
    Effect.gen(function* setDefaults() {
      const json = yield* JsonOutput
      yield* rejectFields(yield* OutputFields)
      if (
        Option.isNone(config.assignee) &&
        Option.isNone(config.label) &&
        Option.isNone(config.priority)
      ) {
        return yield* errorLine(
          "validation",
          "Pass at least one of --assignee, --label or --priority.",
          "rata config set --assignee me --label enhancement --priority medium",
        )
      }
      const service = yield* IssueDefaultsService
      const defaults = yield* service.set({
        assignee: Option.getOrUndefined(config.assignee),
        labels: Option.getOrUndefined(config.label),
        priority: Option.getOrUndefined(yield* resolvePriority(config.priority)),
        dryRun: config.dryRun,
      })
      const document = defaultsDocument(defaults)
      if (config.dryRun) {
        const root = yield* repositoryRoot()
        return yield* writeDryRun(
          json,
          [configAction("config-set", root, document)],
          () => `Would set defaults: ${formatDefaults(document)}`,
        )
      }
      if (json) {
        return yield* writeJson({ dryRun: false, defaults: document })
      }
      return yield* writeLine(`Set defaults: ${formatDefaults(document)}`)
    }).pipe(Effect.catch(reportFailure)),
).pipe(
  Command.withDescription("Set the issue defaults of this repository"),
  Command.withExamples([
    {
      command: "rata config set --assignee me --label enhancement --priority medium",
      description: "Apply these values to every new issue",
    },
    {
      command: "rata config set --priority high",
      description: "Change only the default priority",
    },
  ]),
)

const unsetCommand = Command.make(
  "unset",
  {
    assignee: Flag.Boolean("assignee").pipe(
      Flag.withDescription("Clear the default assignee"),
      Flag.withDefault(false),
    ),
    label: Flag.Boolean("label").pipe(
      Flag.withDescription("Clear the default labels"),
      Flag.withDefault(false),
    ),
    priority: Flag.Boolean("priority").pipe(
      Flag.withDescription("Clear the default priority"),
      Flag.withDefault(false),
    ),
    dryRun: dryRunFlag,
  },
  (config) =>
    Effect.gen(function* unsetDefaults() {
      const json = yield* JsonOutput
      yield* rejectFields(yield* OutputFields)
      if (!config.assignee && !config.label && !config.priority) {
        return yield* errorLine(
          "validation",
          "Pass at least one of --assignee, --label or --priority.",
          "rata config unset --label",
        )
      }
      const service = yield* IssueDefaultsService
      const defaults = yield* service.unset({
        assignee: config.assignee,
        labels: config.label,
        priority: config.priority,
        dryRun: config.dryRun,
      })
      const document = defaultsDocument(defaults)
      if (config.dryRun) {
        const root = yield* repositoryRoot()
        return yield* writeDryRun(
          json,
          [configAction("config-unset", root, document)],
          () => `Would clear the selected defaults: ${formatDefaults(document)}`,
        )
      }
      if (json) {
        return yield* writeJson({ dryRun: false, defaults: document })
      }
      return yield* writeLine(`Cleared the selected defaults: ${formatDefaults(document)}`)
    }).pipe(Effect.catch(reportFailure)),
).pipe(
  Command.withDescription("Clear the issue defaults of this repository"),
  Command.withExamples([
    {
      command: "rata config unset --label",
      description: "Drop the default labels",
    },
  ]),
)

const configCommand = Command.make("config").pipe(
  Command.withDescription("Show and change the issue defaults of this repository"),
  Command.withSubcommands([showCommand, setCommand, unsetCommand]),
  Command.withGlobalFlags([JsonOutput, OutputFields]),
)

export { configCommand }
