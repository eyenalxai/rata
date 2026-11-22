import { Effect, Result } from "effect"
import { Argument } from "effect/cli"
import { EOL } from "node:os"

import type { Viewer } from "@/linear/decode/viewer"
import type { LinearApiError } from "@/linear/errors"

import { arrayField, objectField, scalarField } from "@/cli/field/shape"
import { defineCommand, resourceOutput } from "@/cli/spec"
import { Auth } from "@/config/auth"
import { LinearGateway } from "@/linear/gateway"

type WorkspaceEntry = {
  readonly name: string
  readonly default: boolean
  readonly result: Result.Result<Viewer, LinearApiError>
}

const collectWorkspaces = Effect.fn("Workspace.collect")(function* collectWorkspaces() {
  const auth = yield* Auth
  const gateway = yield* LinearGateway
  const profiles = yield* auth.profiles
  return yield* Effect.forEach(profiles, (profile) =>
    gateway.viewerWithKey(profile.apiKey).pipe(
      Effect.result,
      Effect.map((result): WorkspaceEntry => ({
        name: profile.name,
        default: profile.isDefault,
        result,
      })),
    ),
  )
})

const nameArgument = Argument.String("name").pipe(
  Argument.withDescription("Workspace profile name"),
)

const workspaceListSpec = defineCommand("list", {
  summary: "List the stored workspaces with their viewer and organization",
  input: {},
  output: resourceOutput(
    objectField({
      workspaces: arrayField(
        objectField({
          name: scalarField,
          default: scalarField,
          viewer: scalarField,
          error: scalarField,
        }),
      ),
    }),
  ),
  run: () =>
    Effect.gen(function* listWorkspaces() {
      const workspaces = yield* collectWorkspaces()
      const value = {
        workspaces: workspaces.map((workspace) => ({
          name: workspace.name,
          default: workspace.default,
          viewer: Result.isSuccess(workspace.result) ? workspace.result.success : null,
          error: Result.isFailure(workspace.result) ? workspace.result.failure.message : null,
        })),
      }
      const text =
        workspaces.length === 0
          ? ["No stored workspaces."]
          : [
              workspaces
                .map((workspace) =>
                  Result.isSuccess(workspace.result)
                    ? `${workspace.default ? "*" : " "} ${workspace.name}\t${workspace.result.success.name} <${workspace.result.success.email}>\t${workspace.result.success.organization.name}`
                    : `${workspace.default ? "*" : " "} ${workspace.name}\t! ${workspace.result.failure.message}`,
                )
                .join(EOL),
            ]
      return { kind: "resource", value, text }
    }),
})

const workspaceUseSpec = defineCommand("use", {
  summary: "Set the default workspace profile",
  examples: [
    {
      command: "rata workspace use work",
      description: "Use the work profile when no repository selects one",
    },
  ],
  input: { name: nameArgument },
  output: resourceOutput(objectField({ default: scalarField })),
  run: (input) =>
    Effect.gen(function* useWorkspace() {
      const auth = yield* Auth
      yield* auth.use(input.name)
      return {
        kind: "resource",
        value: { default: input.name },
        text: [`Default workspace: ${input.name}.`],
      }
    }),
})

export { collectWorkspaces, workspaceListSpec, workspaceUseSpec }
