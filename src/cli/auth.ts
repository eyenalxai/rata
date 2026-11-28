import { Effect, Option } from "effect"
import { Flag } from "effect/cli"

import { objectField, scalarField } from "@/cli/field/shape"
import { readStandardInput } from "@/cli/input"
import { defineCommand, resourceOutput, selectOutput } from "@/cli/spec"
import { Auth } from "@/config/auth"
import { TrackerError } from "@/domain/error"
import { LinearGateway } from "@/linear/gateway"

const workspaceFlag = Flag.String("workspace").pipe(
  Flag.withDescription("Workspace profile name"),
  Flag.optional,
)

const loginSpec = defineCommand("login", {
  summary: "Store a Linear API key as a workspace profile",
  examples: [
    {
      command: "pbpaste | rata admin auth login --with-token",
      description: "Store the API key from the clipboard as the default profile",
    },
    {
      command: "pbpaste | rata admin auth login --with-token --workspace work",
      description: "Store the API key as the work profile",
    },
  ],
  input: {
    token: Flag.Boolean("with-token").pipe(
      Flag.withDescription("Read the API key from standard input"),
      Flag.withDefault(false),
    ),
    workspace: workspaceFlag,
  },
  output: resourceOutput(
    objectField({
      profile: scalarField,
      storePath: scalarField,
    }),
  ),
  run: (input) =>
    Effect.gen(function* login() {
      if (!input.token) {
        return yield* new TrackerError({
          code: "validation",
          message: "Pass --with-token and pipe the API key on standard input.",
          hint: null,
        })
      }
      const apiKey = (yield* readStandardInput()).trim()
      if (apiKey.length === 0) {
        return yield* new TrackerError({
          code: "validation",
          message: "No API key on standard input.",
          hint: null,
        })
      }
      const auth = yield* Auth
      const workspace = Option.getOrElse(input.workspace, () => "default")
      yield* auth.login(apiKey, workspace)
      const file = yield* auth.storePath
      return {
        kind: "resource",
        value: { profile: workspace, storePath: file },
        text: [`Stored the Linear API key for workspace "${workspace}" at ${file}.`],
      }
    }),
})

const viewerShape = objectField({
  id: scalarField,
  name: scalarField,
  displayName: scalarField,
  email: scalarField,
  active: scalarField,
  admin: scalarField,
  organization: objectField({
    id: scalarField,
    name: scalarField,
    urlKey: scalarField,
  }),
})

const statusSpec = defineCommand("status", {
  summary: "Show the selected profile, viewer and organization",
  input: { workspace: workspaceFlag },
  output: selectOutput(
    objectField({
      authenticated: scalarField,
      source: scalarField,
      profile: scalarField,
      storePath: scalarField,
      viewer: viewerShape,
    }),
  ),
  run: (input) =>
    Effect.gen(function* status() {
      const auth = yield* Auth
      const gateway = yield* LinearGateway
      const file = yield* auth.storePath
      if (Option.isSome(input.workspace)) {
        const name = input.workspace.value
        const profiles = yield* auth.profiles
        const profile = profiles.find((entry) => entry.name === name)
        if (profile === undefined) {
          return yield* new TrackerError({
            code: "validation",
            message: `No workspace named "${name}". Run \`rata admin auth login --workspace ${name} --with-token\` to add it.`,
            hint: null,
          })
        }
        const viewer = yield* gateway.viewerWithKey(profile.apiKey)
        return {
          kind: "resource",
          value: {
            authenticated: true,
            source: "profile",
            profile: name,
            storePath: file,
            viewer,
          },
          text: [
            `Authenticated as ${viewer.name} <${viewer.email}> in ${viewer.organization.name} via workspace "${name}".`,
          ],
        }
      }
      const resolved = yield* auth.resolve
      if (Option.isNone(resolved)) {
        return yield* new TrackerError({
          code: "auth",
          message:
            "Not authenticated. Run `rata admin auth login --with-token`, or set LINEAR_API_KEY.",
          hint: null,
        })
      }
      const viewer = yield* gateway.viewer
      const value = {
        authenticated: true,
        source: resolved.value.source,
        profile: Option.getOrNull(resolved.value.profile),
        storePath: file,
        viewer,
      }
      const via =
        resolved.value.source === "env"
          ? "LINEAR_API_KEY"
          : `workspace "${Option.getOrElse(resolved.value.profile, () => "default")}"`
      return {
        kind: "resource",
        value,
        text: [
          `Authenticated as ${viewer.name} <${viewer.email}> in ${viewer.organization.name} via ${via}.`,
        ],
      }
    }),
})

const logoutSpec = defineCommand("logout", {
  summary: "Remove one stored workspace profile",
  input: { workspace: workspaceFlag },
  output: resourceOutput(
    objectField({
      removed: scalarField,
      workspace: scalarField,
    }),
  ),
  run: (input) =>
    Effect.gen(function* logout() {
      const auth = yield* Auth
      const workspace = Option.getOrElse(input.workspace, () => "default")
      const removed = yield* auth.logout(workspace)
      return {
        kind: "resource",
        value: { removed, workspace },
        text: [
          removed
            ? `Removed the workspace "${workspace}".`
            : `No stored workspace named "${workspace}".`,
        ],
      }
    }),
})

export { loginSpec, logoutSpec, statusSpec }
