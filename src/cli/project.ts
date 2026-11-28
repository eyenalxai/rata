import { Effect, Option } from "effect"
import { Argument, Flag } from "effect/cli"
import { EOL } from "node:os"

import { ProjectService } from "@/api/project"
import { RepoTeam } from "@/api/repo-team"
import { confirm } from "@/cli/confirm"
import { objectField, scalarField } from "@/cli/field/shape"
import { requirePageSize } from "@/cli/input"
import { afterFlag, allFlag, limitFlag } from "@/cli/list-flags"
import { nextPageHint } from "@/cli/output"
import { collectionOutput, defineCommand, resourceOutput, textOutput } from "@/cli/spec"

const optionalText = (name: string, description: string) =>
  Flag.String(name).pipe(Flag.withDescription(description), Flag.optional)

const projectShape = objectField({
  id: scalarField,
  name: scalarField,
  progress: scalarField,
  status: objectField({ name: scalarField }),
  trashed: scalarField,
})

const includeArchivedFlag = Flag.Boolean("include-archived").pipe(
  Flag.withDescription("Include trashed and archived projects"),
  Flag.withDefault(false),
)

const formatProgress = (progress: number): string => `${Math.round(progress * 100)}%`

const projectListSpec = defineCommand("list", {
  summary: "List the projects in the workspace",
  input: {
    team: optionalText(
      "team",
      "Filter by team key or id. Defaults to the team from `rata admin link`",
    ),
    limit: limitFlag,
    after: afterFlag,
    all: allFlag,
    includeArchived: includeArchivedFlag,
  },
  output: collectionOutput(projectShape),
  run: (input) =>
    Effect.gen(function* listProjects() {
      yield* requirePageSize(input.limit)
      const projects = yield* ProjectService
      const repoTeam = yield* RepoTeam
      const teamId = yield* repoTeam.resolve(Option.getOrUndefined(input.team))
      const page = yield* projects.list({
        after: Option.getOrNull(input.after),
        limit: input.limit,
        all: input.all,
        includeArchived: input.includeArchived,
        teamId,
      })
      const hint =
        page.pageInfo.hasNextPage && page.pageInfo.endCursor !== null
          ? `${EOL}${nextPageHint("projects", page.pageInfo.endCursor)}`
          : ""
      const text =
        page.nodes.length === 0
          ? ["No projects."]
          : [
              page.nodes
                .map((project) => {
                  const marker = project.trashed ? " (deleted)" : ""
                  return `${project.name}${marker}\t${project.status.name}\t${formatProgress(project.progress)}\t${project.id}`
                })
                .join(EOL) + hint,
            ]
      return {
        kind: "collection",
        key: "projects",
        items: page.nodes,
        pageInfo: page.pageInfo,
        text,
      }
    }),
})

const projectCreateSpec = defineCommand("create", {
  summary: "Create a project in one or more teams",
  examples: [
    {
      command: 'rata admin project create --name "Spec: login" --team RAT',
      description: "Create a project in one team",
    },
    {
      command: 'rata admin project create --name "Spec: login" --team RAT --team OPS',
      description: "Create a project in several teams",
    },
  ],
  input: {
    name: Flag.String("name").pipe(Flag.withDescription("Project name")),
    team: Flag.atLeast(Flag.String("team"), 0).pipe(
      Flag.withDescription(
        "Team key or id. Repeat for more teams. Defaults to the team from `rata admin link`",
      ),
    ),
    description: optionalText("description", "Project description"),
  },
  output: resourceOutput(objectField({ project: scalarField })),
  run: (input) =>
    Effect.gen(function* createProject() {
      const projects = yield* ProjectService
      const project = yield* projects.create({
        name: input.name,
        description: Option.getOrUndefined(input.description),
        teams: input.team.length > 0 ? input.team : undefined,
      })
      return {
        kind: "resource",
        value: { project },
        text: [`Created project ${project.name} (${project.id}).`],
      }
    }),
})

const projectDeleteSpec = defineCommand("delete", {
  summary: "Move a project to the trash, where Linear keeps it recoverable",
  examples: [
    {
      command: 'rata admin project delete "Login revamp"',
      description: "Move a project to the trash after a confirmation prompt",
    },
    {
      command: 'rata admin project delete "Login revamp" --yes',
      description: "Move a project to the trash without a prompt",
    },
  ],
  input: {
    ref: Argument.String("ref").pipe(Argument.withDescription("Project name or UUID")),
    yes: Flag.Boolean("yes").pipe(
      Flag.withDescription("Skip the confirmation prompt"),
      Flag.withDefault(false),
    ),
  },
  output: [resourceOutput(objectField({ deleted: scalarField })), textOutput],
  run: (input) =>
    Effect.gen(function* deleteProject() {
      const projects = yield* ProjectService
      const project = yield* projects.resolve(input.ref)
      const confirmed = yield* confirm(`Delete project ${project.name} (${project.id})?`, input.yes)
      if (!confirmed) {
        return { kind: "text", lines: ["Aborted."] }
      }
      const deleted = yield* projects.delete(project)
      return {
        kind: "resource",
        value: { deleted },
        text: [`Deleted ${deleted.name} (${deleted.id}).`],
      }
    }),
})

const projectRestoreSpec = defineCommand("restore", {
  summary: "Bring a project back from the trash, without a prompt",
  examples: [
    {
      command: 'rata admin project restore "Login revamp"',
      description: "Bring a project back from the trash by name",
    },
    {
      command: "rata admin project restore 0f8fad5b-d9cb-469f-a165-70867728950e",
      description: "Bring a project back from the trash by UUID",
    },
  ],
  input: {
    ref: Argument.String("ref").pipe(Argument.withDescription("Project name or UUID")),
  },
  output: resourceOutput(objectField({ restored: scalarField })),
  run: (input) =>
    Effect.gen(function* restoreProject() {
      const projects = yield* ProjectService
      const project = yield* projects.resolveTrashed(input.ref)
      const restored = yield* projects.restore(project)
      return {
        kind: "resource",
        value: { restored },
        text: [`Restored ${restored.name} (${restored.id}).`],
      }
    }),
})

export { projectCreateSpec, projectDeleteSpec, projectListSpec, projectRestoreSpec }
