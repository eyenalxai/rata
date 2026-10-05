import { Effect, Result } from "effect"
import { Argument, Command, Flag } from "effect/cli"
import { EOL } from "node:os"

import type { Viewer } from "@/api/client"
import type { LinearApiError } from "@/api/errors"

import { LinearClient } from "@/api/client"
import { reportFailure, writeJson, writeLine } from "@/cli/output"
import { Auth } from "@/config/auth"

type WorkspaceEntry = {
  readonly name: string
  readonly default: boolean
  readonly result: Result.Result<Viewer, LinearApiError>
}

const collectWorkspaces = Effect.fn("Workspace.collect")(function* collectWorkspaces() {
  const auth = yield* Auth
  const client = yield* LinearClient
  const profiles = yield* auth.profiles
  return yield* Effect.forEach(profiles, (profile) =>
    client.viewerWithKey(profile.apiKey).pipe(
      Effect.result,
      Effect.map((result): WorkspaceEntry => ({
        name: profile.name,
        default: profile.isDefault,
        result,
      })),
    ),
  )
})

const jsonFlag = Flag.Boolean("json").pipe(
  Flag.withDescription("Print machine-readable JSON"),
  Flag.withDefault(false),
)

const nameArgument = Argument.String("name").pipe(
  Argument.withDescription("Workspace profile name"),
)

const listCommand = Command.make("list", { json: jsonFlag }, (config) =>
  Effect.gen(function* listWorkspaces() {
    const workspaces = yield* collectWorkspaces()
    if (config.json) {
      return yield* writeJson({
        workspaces: workspaces.map((workspace) => ({
          name: workspace.name,
          default: workspace.default,
          viewer: Result.isSuccess(workspace.result) ? workspace.result.success : null,
          error: Result.isFailure(workspace.result) ? workspace.result.failure.message : null,
        })),
      })
    }
    if (workspaces.length === 0) {
      return yield* writeLine("No stored workspaces.")
    }
    return yield* writeLine(
      workspaces
        .map((workspace) =>
          Result.isSuccess(workspace.result)
            ? `${workspace.default ? "*" : " "} ${workspace.name}\t${workspace.result.success.name} <${workspace.result.success.email}>\t${workspace.result.success.organization.name}`
            : `${workspace.default ? "*" : " "} ${workspace.name}\t! ${workspace.result.failure.message}`,
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

export { collectWorkspaces, workspaceCommand }
