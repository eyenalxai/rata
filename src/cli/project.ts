import { Effect, Option } from "effect"
import { Argument, Command, Flag } from "effect/cli"
import { EOL } from "node:os"

import { maxPageSize } from "@/api/pagination"
import { ProjectService } from "@/api/project"
import { confirm } from "@/cli/confirm"
import { nextPageHint, reportFailure, validatePageSize, writeJson, writeLine } from "@/cli/output"

const jsonFlag = Flag.Boolean("json").pipe(
  Flag.withDescription("Print machine-readable JSON"),
  Flag.withDefault(false),
)

const optionalText = (name: string, description: string) =>
  Flag.String(name).pipe(Flag.withDescription(description), Flag.optional)

const limitFlag = Flag.Int("limit").pipe(
  Flag.withDescription(`Page size, at most ${maxPageSize}`),
  Flag.withDefault(50),
)

const afterFlag = Flag.String("after").pipe(
  Flag.withDescription("Continue after this cursor"),
  Flag.optional,
)

const includeArchivedFlag = Flag.Boolean("include-archived").pipe(
  Flag.withDescription("Include trashed and archived projects"),
  Flag.withDefault(false),
)

const formatProgress = (progress: number): string => `${Math.round(progress * 100)}%`

const listCommand = Command.make(
  "list",
  { json: jsonFlag, limit: limitFlag, after: afterFlag, includeArchived: includeArchivedFlag },
  (config) =>
    Effect.gen(function* listProjects() {
      const valid = yield* validatePageSize(config.limit)
      if (!valid) {
        return
      }
      const projects = yield* ProjectService
      const page = yield* projects.list({
        after: Option.getOrNull(config.after),
        limit: config.limit,
        includeArchived: config.includeArchived,
      })
      if (config.json) {
        yield* writeJson({ projects: page.nodes, pageInfo: page.pageInfo })
        return
      }
      if (page.nodes.length === 0) {
        yield* writeLine("No projects.")
        return
      }
      const body = page.nodes
        .map((project) => {
          const marker = project.trashed ? " (deleted)" : ""
          return `${project.name}${marker}\t${project.status.name}\t${formatProgress(project.progress)}\t${project.id}`
        })
        .join(EOL)
      const hint =
        page.pageInfo.hasNextPage && page.pageInfo.endCursor !== null
          ? `${EOL}${nextPageHint("projects", page.pageInfo.endCursor)}`
          : ""
      yield* writeLine(`${body}${hint}`)
    }).pipe(Effect.catch(reportFailure)),
).pipe(Command.withDescription("List the projects in the workspace"))

const createCommand = Command.make(
  "create",
  {
    name: Flag.String("name").pipe(Flag.withDescription("Project name")),
    team: Flag.atLeast(Flag.String("team"), 0).pipe(
      Flag.withDescription(
        "Team key or id. Repeat for more teams. Defaults to the team from `rata link`",
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

const deleteCommand = Command.make(
  "delete",
  {
    ref: Argument.String("ref").pipe(Argument.withDescription("Project name or UUID")),
    yes: Flag.Boolean("yes").pipe(
      Flag.withDescription("Skip the confirmation prompt"),
      Flag.withDefault(false),
    ),
    json: jsonFlag,
  },
  (config) =>
    Effect.gen(function* deleteProject() {
      const projects = yield* ProjectService
      const project = yield* projects.resolve(config.ref)
      const confirmed = yield* confirm(
        `Delete project ${project.name} (${project.id})?`,
        config.yes,
      )
      if (!confirmed) {
        return yield* writeLine("Aborted.")
      }
      const deleted = yield* projects.delete(project)
      if (config.json) {
        return yield* writeJson({ deleted })
      }
      return yield* writeLine(`Deleted ${deleted.name} (${deleted.id}).`)
    }).pipe(Effect.catch(reportFailure)),
).pipe(
  Command.withDescription("Move a project to the trash, where Linear keeps it recoverable"),
  Command.withExamples([
    {
      command: 'rata project delete "Login revamp"',
      description: "Move a project to the trash after a confirmation prompt",
    },
    {
      command: 'rata project delete "Login revamp" --yes',
      description: "Move a project to the trash without a prompt",
    },
  ]),
)

const restoreCommand = Command.make(
  "restore",
  {
    ref: Argument.String("ref").pipe(Argument.withDescription("Project name or UUID")),
    json: jsonFlag,
  },
  (config) =>
    Effect.gen(function* restoreProject() {
      const projects = yield* ProjectService
      const project = yield* projects.resolveTrashed(config.ref)
      const restored = yield* projects.restore(project)
      if (config.json) {
        return yield* writeJson({ restored })
      }
      return yield* writeLine(`Restored ${restored.name} (${restored.id}).`)
    }).pipe(Effect.catch(reportFailure)),
).pipe(
  Command.withDescription("Bring a project back from the trash, without a prompt"),
  Command.withExamples([
    {
      command: 'rata project restore "Login revamp"',
      description: "Bring a project back from the trash by name",
    },
    {
      command: "rata project restore 0f8fad5b-d9cb-469f-a165-70867728950e",
      description: "Bring a project back from the trash by UUID",
    },
  ]),
)

const projectCommand = Command.make("project").pipe(
  Command.withDescription("Create, inspect, delete and restore the projects in the workspace"),
  Command.withSubcommands([listCommand, createCommand, deleteCommand, restoreCommand]),
)

export { projectCommand }
