import { Effect } from "effect"
import { Argument, Command, Flag } from "effect/cli"
import { EOL } from "node:os"

import { LinearClient } from "@/api/client"
import { reportFailure, writeJson, writeLine } from "@/cli/output"
import { Auth } from "@/config/auth"

const jsonFlag = Flag.Boolean("json").pipe(
  Flag.withDescription("Print machine-readable JSON"),
  Flag.withDefault(false),
)

const nameArgument = Argument.String("name").pipe(
  Argument.withDescription("Workspace profile name"),
)

const listCommand = Command.make("list", { json: jsonFlag }, (config) =>
  Effect.gen(function* listWorkspaces() {
    const auth = yield* Auth
    const client = yield* LinearClient
    const profiles = yield* auth.profiles
    const workspaces = yield* Effect.forEach(profiles, (profile) =>
      client.viewerWithKey(profile.apiKey).pipe(
        Effect.map((viewer) => ({
          name: profile.name,
          default: profile.isDefault,
          viewer,
        })),
      ),
    )
    if (config.json) {
      return yield* writeJson({ workspaces })
    }
    if (workspaces.length === 0) {
      return yield* writeLine("No stored workspaces.")
    }
    return yield* writeLine(
      workspaces
        .map(
          (workspace) =>
            `${workspace.default ? "*" : " "} ${workspace.name}\t${workspace.viewer.name} <${workspace.viewer.email}>\t${workspace.viewer.organization.name}`,
        )
        .join(EOL),
    )
  }).pipe(Effect.catch(reportFailure)),
).pipe(Command.withDescription("List the stored workspaces with their viewer and organization"))

const useCommand = Command.make("use", { name: nameArgument, json: jsonFlag }, (config) =>
  Effect.gen(function* useWorkspace() {
    const auth = yield* Auth
    yield* auth.use(config.name)
    if (config.json) {
      return yield* writeJson({ default: config.name })
    }
    return yield* writeLine(`Default workspace: ${config.name}.`)
  }).pipe(Effect.catch(reportFailure)),
).pipe(
  Command.withDescription("Set the default workspace profile"),
  Command.withExamples([
    {
      command: "rata workspace use work",
      description: "Use the work profile when no repository selects one",
    },
  ]),
)

const workspaceCommand = Command.make("workspace").pipe(
  Command.withDescription("Manage the stored Linear workspace profiles"),
  Command.withSubcommands([listCommand, useCommand]),
)

export { workspaceCommand }
