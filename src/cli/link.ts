import { Effect, Option } from "effect"
import { Flag } from "effect/cli"

import { objectField, scalarField } from "@/cli/field/shape"
import { defineCommand, resourceOutput } from "@/cli/spec"
import { LinkService } from "@/config/link"
import { machineTimezone } from "@/domain/timezone"

const teamFlag = Flag.String("team").pipe(
  Flag.withDescription("Team key or id. Without --workspace, link searches every stored workspace"),
  Flag.optional,
)

const projectFlag = Flag.String("project").pipe(
  Flag.withDescription("Default project name or id for this repository"),
  Flag.optional,
)

const workspaceFlag = Flag.String("workspace").pipe(
  Flag.withDescription("Workspace profile to link in. Skips the workspace prompt"),
  Flag.optional,
)

const createFlag = Flag.Boolean("create").pipe(
  Flag.withDescription("Create the team when it does not exist"),
  Flag.withDefault(false),
)

const nameFlag = Flag.String("name").pipe(
  Flag.withDescription("Team name, used with --create"),
  Flag.optional,
)

const linkSpec = defineCommand("link", {
  summary: "Bind this repository to a Linear team and set its timezone",
  examples: [
    {
      command: "rata admin link",
      description: "Choose the workspace and the team interactively",
    },
    {
      command: "rata admin link --team RAT --project rata",
      description: "Link the repository to a team found in the stored workspaces",
    },
    {
      command: 'rata admin link --team SCR --create --name "Scratch"',
      description: "Create the team, then link the repository",
    },
    {
      command: "rata admin link --workspace work --team RAT",
      description: "Link to a team in the work workspace",
    },
  ],
  input: {
    team: teamFlag,
    project: projectFlag,
    workspace: workspaceFlag,
    create: createFlag,
    name: nameFlag,
  },
  output: resourceOutput(
    objectField({
      team: scalarField,
      project: scalarField,
      workspace: scalarField,
      timezone: scalarField,
    }),
  ),
  run: (input) =>
    Effect.gen(function* link() {
      const service = yield* LinkService
      const result = yield* service.link({
        team: input.team,
        project: input.project,
        workspace: input.workspace,
        create: input.create,
        name: input.name,
        timezone: machineTimezone(),
      })
      const timezone = Option.getOrNull(result.timezone)
      const text = [`Linked ${result.team.key}: ${result.team.name} (${result.team.id})`]
      if (Option.isSome(result.timezone)) {
        text.push(
          `Updated timezone: ${result.timezone.value.previous} -> ${result.timezone.value.current}`,
        )
      }
      text.push(
        "",
        "Next steps:",
        "  - Confirm the connection: `rata admin auth status`.",
        "  - List the issues: `rata issue list`.",
      )
      return {
        kind: "resource",
        value: {
          team: result.team,
          project: Option.getOrNull(result.project),
          workspace: Option.getOrNull(result.workspace),
          timezone,
        },
        text,
      }
    }),
})

export { linkSpec }
