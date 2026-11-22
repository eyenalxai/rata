import { Effect, Option } from "effect"
import { Flag } from "effect/cli"

import type { PlanAction } from "@/domain/plan"

import { arrayField, objectField, scalarField } from "@/cli/field/shape"
import { dryRunFlag } from "@/cli/output"
import { resolvePriority } from "@/cli/priority"
import { defineCommand, resourceOutput, selectOutput } from "@/cli/spec"
import { defaultsDocument, formatDefaults, IssueDefaultsService } from "@/config/defaults"
import { currentDirectory } from "@/config/repo"
import { RepositoryIdentity } from "@/config/repo-identity"
import { TrackerError } from "@/domain/error"

const optionalText = (name: string, description: string) =>
  Flag.String(name).pipe(Flag.withDescription(description), Flag.optional)

const defaultsShape = objectField({
  assignee: scalarField,
  labels: arrayField(scalarField),
  priority: scalarField,
})

const changeShape = objectField({
  dryRun: scalarField,
  actions: arrayField(
    objectField({
      action: scalarField,
      target: scalarField,
      changes: scalarField,
    }),
  ),
  defaults: scalarField,
})

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

const configShowSpec = defineCommand("show", {
  summary: "Show the issue defaults of this repository",
  examples: [
    {
      command: "rata config show",
      description: "Show the defaults of this repository",
    },
    {
      command: "rata config show --select assignee,labels",
      description: "Read the defaults for an agent",
    },
  ],
  input: {},
  output: selectOutput(defaultsShape, ["defaults"]),
  run: () =>
    Effect.gen(function* showDefaults() {
      const service = yield* IssueDefaultsService
      const document = defaultsDocument(yield* service.show)
      return {
        kind: "resource",
        value: { defaults: document },
        text: [`defaults: ${formatDefaults(document)}`],
      }
    }),
})

const configSetSpec = defineCommand("set", {
  summary: "Set the issue defaults of this repository",
  examples: [
    {
      command: "rata config set --assignee me --label enhancement --priority medium",
      description: "Apply these values to every new issue",
    },
    {
      command: "rata config set --priority high",
      description: "Change only the default priority",
    },
  ],
  input: {
    assignee: assigneeFlag,
    label: labelFlag,
    priority: priorityFlag,
    dryRun: dryRunFlag,
  },
  control: (input) => ({ dryRun: input.dryRun }),
  output: resourceOutput(changeShape),
  run: (input, control) =>
    Effect.gen(function* setDefaults() {
      if (
        Option.isNone(input.assignee) &&
        Option.isNone(input.label) &&
        Option.isNone(input.priority)
      ) {
        return yield* new TrackerError({
          code: "validation",
          message: "Pass at least one of --assignee, --label or --priority.",
          hint: "rata config set --assignee me --label enhancement --priority medium",
        })
      }
      const service = yield* IssueDefaultsService
      const defaults = yield* service.set({
        assignee: Option.getOrUndefined(input.assignee),
        labels: Option.getOrUndefined(input.label),
        priority: Option.getOrUndefined(yield* resolvePriority(input.priority)),
        dryRun: control.dryRun,
      })
      const document = defaultsDocument(defaults)
      if (control.dryRun) {
        const root = yield* repositoryRoot()
        return {
          kind: "resource",
          value: { dryRun: true, actions: [configAction("config-set", root, document)] },
          text: [`Would set defaults: ${formatDefaults(document)}`],
        }
      }
      return {
        kind: "resource",
        value: { dryRun: false, defaults: document },
        text: [`Set defaults: ${formatDefaults(document)}`],
      }
    }),
})

const configUnsetSpec = defineCommand("unset", {
  summary: "Clear the issue defaults of this repository",
  examples: [
    {
      command: "rata config unset --label",
      description: "Drop the default labels",
    },
  ],
  input: {
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
  control: (input) => ({ dryRun: input.dryRun }),
  output: resourceOutput(changeShape),
  run: (input, control) =>
    Effect.gen(function* unsetDefaults() {
      if (!input.assignee && !input.label && !input.priority) {
        return yield* new TrackerError({
          code: "validation",
          message: "Pass at least one of --assignee, --label or --priority.",
          hint: "rata config unset --label",
        })
      }
      const service = yield* IssueDefaultsService
      const defaults = yield* service.unset({
        assignee: input.assignee,
        labels: input.label,
        priority: input.priority,
        dryRun: control.dryRun,
      })
      const document = defaultsDocument(defaults)
      if (control.dryRun) {
        const root = yield* repositoryRoot()
        return {
          kind: "resource",
          value: { dryRun: true, actions: [configAction("config-unset", root, document)] },
          text: [`Would clear the selected defaults: ${formatDefaults(document)}`],
        }
      }
      return {
        kind: "resource",
        value: { dryRun: false, defaults: document },
        text: [`Cleared the selected defaults: ${formatDefaults(document)}`],
      }
    }),
})

export { configSetSpec, configShowSpec, configUnsetSpec }
