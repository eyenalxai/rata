import { Effect, Option } from "effect"
import { Command, Flag } from "effect/cli"

import type { InitFileReport } from "@/config/init"
import type { InitAction } from "@/domain/init"

import { reportFailure, writeLine } from "@/cli/output"
import { InitService } from "@/config/init"

const teamFlag = Flag.String("team").pipe(
  Flag.withDescription("Default team key for this repository, for example RAT"),
  Flag.optional,
)

const projectFlag = Flag.String("project").pipe(
  Flag.withDescription("Default project name for this repository"),
  Flag.optional,
)

const ensureLabelsFlag = Flag.Boolean("ensure-labels").pipe(
  Flag.withDescription("Create the canonical labels in the team"),
  Flag.withDefault(false),
)

const forceFlag = Flag.Boolean("force").pipe(
  Flag.withDescription("Overwrite existing files"),
  Flag.withDefault(false),
)

const printFlag = Flag.Boolean("print").pipe(
  Flag.withDescription("Print the tracker document and write nothing"),
  Flag.withDefault(false),
)

const actionLabels: Record<InitAction, string> = {
  create: "created",
  overwrite: "overwritten",
  unchanged: "unchanged",
  skip: "skipped",
}

const formatFile = (file: InitFileReport): string => {
  const suffix = file.action === "skip" ? " (exists; pass --force to overwrite)" : ""
  return `${actionLabels[file.action]}: ${file.path}${suffix}`
}

const formatNames = (names: readonly string[]): string =>
  names.length === 0 ? "none" : names.join(", ")

const initCommand = Command.make(
  "init",
  {
    team: teamFlag,
    project: projectFlag,
    ensureLabels: ensureLabelsFlag,
    force: forceFlag,
    print: printFlag,
  },
  (config) =>
    Effect.gen(function* init() {
      const service = yield* InitService
      const result = yield* service.run({
        team: config.team,
        project: config.project,
        force: config.force,
        print: config.print,
        ensureLabels: config.ensureLabels,
      })
      if (Option.isSome(result.document)) {
        return yield* writeLine(result.document.value.trimEnd())
      }
      yield* Effect.forEach(result.files, (file) => writeLine(formatFile(file)), { discard: true })
      if (Option.isSome(result.labels)) {
        const ensured = result.labels.value
        yield* writeLine(
          `created labels: ${formatNames(ensured.created.map((label) => label.name))}`,
        )
        yield* writeLine(
          `existing labels: ${formatNames(ensured.existing.map((label) => label.name))}`,
        )
      }
      yield* writeLine("")
      yield* writeLine("Next steps:")
      yield* writeLine("  - Store a Linear API key: `rata auth login --with-token`.")
      if (!config.ensureLabels) {
        const team = Option.getOrElse(result.team, () => "<key>")
        yield* writeLine(`  - Create the canonical labels: \`rata label ensure --team ${team}\`.`)
      }
      return yield* writeLine("  - Check the connection: `rata issue list`.")
    }).pipe(Effect.catch(reportFailure)),
).pipe(
  Command.withDescription("Configure this repository for the Linear tracker"),
  Command.withExamples([
    {
      command: "rata init --team RAT --project rata",
      description: "Write the repository config, the tracker document and the agent skills block",
    },
  ]),
)

export { initCommand }
