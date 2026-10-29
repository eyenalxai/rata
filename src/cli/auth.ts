import { Effect, Option, Schema, Stdio, Stream } from "effect"
import { Command, Flag } from "effect/cli"

import { LinearClient } from "@/api/client"
import { OutputFields, rejectFields } from "@/cli/fields"
import { JsonOutput, errorLine, reportFailure, writeJson, writeLine } from "@/cli/output"
import { Auth } from "@/config/auth"

class InputError extends Schema.TaggedError<InputError>()("InputError", {
  message: Schema.String,
}) {}

const workspaceFlag = Flag.String("workspace").pipe(
  Flag.withDescription("Workspace profile name"),
  Flag.optional,
)

const readStandardInput = Effect.fn("Cli.readStandardInput")(function* readStandardInput() {
  const stdio = yield* Stdio.Stdio
  const text = yield* stdio.stdin.pipe(
    Stream.decodeText(),
    Stream.mkString,
    Effect.mapError(() => new InputError({ message: "Could not read standard input." })),
  )
  return text.trim()
})

const loginCommand = Command.make(
  "login",
  {
    token: Flag.Boolean("with-token").pipe(
      Flag.withDescription("Read the API key from standard input"),
      Flag.withDefault(false),
    ),
    workspace: workspaceFlag,
  },
  (config) =>
    Effect.gen(function* login() {
      yield* rejectFields(yield* OutputFields)
      if (!config.token) {
        return yield* errorLine(
          "validation",
          "Pass --with-token and pipe the API key on standard input.",
        )
      }
      const apiKey = yield* readStandardInput()
      if (apiKey.length === 0) {
        return yield* errorLine("validation", "No API key on standard input.")
      }
      const auth = yield* Auth
      const workspace = Option.getOrElse(config.workspace, () => "default")
      yield* auth.login(apiKey, workspace)
      const file = yield* auth.storePath
      return yield* writeLine(`Stored the Linear API key for workspace "${workspace}" at ${file}.`)
    }).pipe(Effect.catch(reportFailure)),
).pipe(
  Command.withDescription("Store a Linear API key as a workspace profile"),
  Command.withExamples([
    {
      command: "pbpaste | rata auth login --with-token",
      description: "Store the API key from the clipboard as the default profile",
    },
    {
      command: "pbpaste | rata auth login --with-token --workspace work",
      description: "Store the API key as the work profile",
    },
  ]),
)

const statusCommand = Command.make("status", { workspace: workspaceFlag }, (config) =>
  Effect.gen(function* status() {
    const json = yield* JsonOutput
    yield* rejectFields(yield* OutputFields)
    const auth = yield* Auth
    const client = yield* LinearClient
    const file = yield* auth.storePath
    if (Option.isSome(config.workspace)) {
      const name = config.workspace.value
      const profiles = yield* auth.profiles
      const profile = profiles.find((entry) => entry.name === name)
      if (profile === undefined) {
        return yield* errorLine(
          "validation",
          `No workspace named "${name}". Run \`rata auth login --workspace ${name} --with-token\` to add it.`,
        )
      }
      const viewer = yield* client.viewerWithKey(profile.apiKey)
      if (json) {
        return yield* writeJson({
          authenticated: true,
          source: "profile",
          profile: name,
          storePath: file,
          viewer,
        })
      }
      return yield* writeLine(
        `Authenticated as ${viewer.name} <${viewer.email}> in ${viewer.organization.name} via workspace "${name}".`,
      )
    }
    const resolved = yield* auth.resolve
    if (Option.isNone(resolved)) {
      return yield* errorLine(
        "auth",
        "Not authenticated. Run `rata auth login --with-token`, or set LINEAR_API_KEY.",
      )
    }
    const viewer = yield* client.viewer
    if (json) {
      return yield* writeJson({
        authenticated: true,
        source: resolved.value.source,
        profile: Option.getOrNull(resolved.value.profile),
        storePath: file,
        viewer,
      })
    }
    const via =
      resolved.value.source === "env"
        ? "LINEAR_API_KEY"
        : `workspace "${Option.getOrElse(resolved.value.profile, () => "default")}"`
    return yield* writeLine(
      `Authenticated as ${viewer.name} <${viewer.email}> in ${viewer.organization.name} via ${via}.`,
    )
  }).pipe(Effect.catch(reportFailure)),
).pipe(Command.withDescription("Show the selected profile, viewer and organization"))

const logoutCommand = Command.make("logout", { workspace: workspaceFlag }, (config) =>
  Effect.gen(function* logout() {
    const json = yield* JsonOutput
    yield* rejectFields(yield* OutputFields)
    const auth = yield* Auth
    const workspace = Option.getOrElse(config.workspace, () => "default")
    const removed = yield* auth.logout(workspace)
    if (json) {
      return yield* writeJson({ removed, workspace })
    }
    return yield* writeLine(
      removed
        ? `Removed the workspace "${workspace}".`
        : `No stored workspace named "${workspace}".`,
    )
  }).pipe(Effect.catch(reportFailure)),
).pipe(Command.withDescription("Remove one stored workspace profile"))

const authCommand = Command.make("auth").pipe(
  Command.withDescription("Manage Linear authentication"),
  Command.withSubcommands([loginCommand, statusCommand, logoutCommand]),
  Command.withGlobalFlags([JsonOutput, OutputFields]),
)

const whoamiCommand = Command.make("whoami", {}, () =>
  Effect.gen(function* whoami() {
    const json = yield* JsonOutput
    yield* rejectFields(yield* OutputFields)
    const client = yield* LinearClient
    const viewer = yield* client.viewer
    if (json) {
      return yield* writeJson(viewer)
    }
    return yield* writeLine(`${viewer.name} <${viewer.email}>`)
  }).pipe(Effect.catch(reportFailure)),
).pipe(
  Command.withDescription("Print the authenticated Linear viewer"),
  Command.withGlobalFlags([JsonOutput, OutputFields]),
)

export { authCommand, whoamiCommand }
