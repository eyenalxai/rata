import { Effect } from "effect"
import { Command, Flag } from "effect/cli"
import { EOL } from "node:os"

import { ProjectService } from "@/api/project"
import { reportFailure, writeJson, writeLine } from "@/cli/output"

const jsonFlag = Flag.Boolean("json").pipe(
  Flag.withDescription("Print machine-readable JSON"),
  Flag.withDefault(false),
)

const listCommand = Command.make("list", { json: jsonFlag }, (config) =>
  Effect.gen(function* listProjects() {
    const projects = yield* ProjectService
    const all = yield* projects.list
    if (config.json) {
      return yield* writeJson(all)
    }
    if (all.length === 0) {
      return yield* writeLine("No projects.")
    }
    return yield* writeLine(
      all.map((project) => `${project.name}\t${project.status.name}\t${project.id}`).join(EOL),
    )
  }).pipe(Effect.catch(reportFailure)),
).pipe(Command.withDescription("List the projects in the workspace"))

const projectCommand = Command.make("project").pipe(
  Command.withDescription("Inspect the projects in the workspace"),
  Command.withSubcommands([listCommand]),
)

export { projectCommand }
