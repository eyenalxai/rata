import { Effect, Option } from "effect"
import { Command, Flag } from "effect/cli"
import { EOL } from "node:os"

import { ProjectService } from "@/api/project"
import { reportFailure, writeJson, writeLine } from "@/cli/output"

const jsonFlag = Flag.Boolean("json").pipe(
  Flag.withDescription("Print machine-readable JSON"),
  Flag.withDefault(false),
)

const optionalText = (name: string, description: string) =>
  Flag.String(name).pipe(Flag.withDescription(description), Flag.optional)

const formatProgress = (progress: number): string => `${Math.round(progress * 100)}%`

const listCommand = Command.make("list", { json: jsonFlag }, (config) =>
  Effect.gen(function* listProjects() {
    const projects = yield* ProjectService
    const all = yield* projects.list
    if (config.json) {
      return yield* writeJson({ projects: all })
    }
    if (all.length === 0) {
      return yield* writeLine("No projects.")
    }
    return yield* writeLine(
      all
        .map(
          (project) =>
            `${project.name}\t${project.status.name}\t${formatProgress(project.progress)}\t${project.id}`,
        )
        .join(EOL),
    )
  }).pipe(Effect.catch(reportFailure)),
).pipe(Command.withDescription("List the projects in the workspace"))

const createCommand = Command.make(
  "create",
  {
    name: Flag.String("name").pipe(Flag.withDescription("Project name")),
    team: Flag.atLeast(Flag.String("team"), 0).pipe(
      Flag.withDescription(
        "Team key or id. Repeat for more teams. Defaults to the team in .rata.json",
      ),
    ),
    description: optionalText("description", "Project description"),
    json: jsonFlag,
  },
  (config) =>
    Effect.gen(function* createProject() {
      const projects = yield* ProjectService
      const project = yield* projects.create({
        name: config.name,
        description: Option.getOrUndefined(config.description),
        teams: config.team.length > 0 ? config.team : undefined,
      })
      if (config.json) {
        return yield* writeJson({ project })
      }
      return yield* writeLine(`Created project ${project.name} (${project.id}).`)
    }).pipe(Effect.catch(reportFailure)),
).pipe(
  Command.withDescription("Create a project in one or more teams"),
  Command.withExamples([
    {
      command: 'rata project create --name "Spec: login" --team RAT',
      description: "Create a project in one team",
    },
    {
      command: 'rata project create --name "Spec: login" --team RAT --team OPS',
      description: "Create a project in several teams",
    },
  ]),
)

const projectCommand = Command.make("project").pipe(
  Command.withDescription("Create and inspect the projects in the workspace"),
  Command.withSubcommands([listCommand, createCommand]),
)

export { projectCommand }
