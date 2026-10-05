import { Effect, Option, Schema, Stdio, Stream } from "effect"
import { Command, Flag } from "effect/cli"

import { LinearClient } from "@/api/client"
import { errorLine, reportFailure, writeJson, writeLine } from "@/cli/output"
import { Auth } from "@/config/auth"

class InputError extends Schema.TaggedError<InputError>()("InputError", {
  message: Schema.String,
}) {}

const jsonFlag = Flag.Boolean("json").pipe(
  Flag.withDescription("Print machine-readable JSON"),
  Flag.withDefault(false),
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
  },
  (config) =>
    Effect.gen(function* login() {
      if (!config.token) {
        return yield* errorLine(1, "Pass --with-token and pipe the API key on standard input.")
      }
      const apiKey = yield* readStandardInput()
      if (apiKey.length === 0) {
        return yield* errorLine(1, "No API key on standard input.")
      }
      const auth = yield* Auth
      yield* auth.login(apiKey)
      const file = yield* auth.storePath
      return yield* writeLine(`Stored the Linear API key at ${file}.`)
    }).pipe(Effect.catch(reportFailure)),
).pipe(
  Command.withDescription("Store a Linear API key"),
  Command.withExamples([
    {
      command: "pbpaste | rata auth login --with-token",
      description: "Store the API key from the clipboard",
    },
  ]),
)

const statusCommand = Command.make("status", { json: jsonFlag }, (config) =>
  Effect.gen(function* status() {
    const auth = yield* Auth
    const resolved = yield* auth.resolve
    if (Option.isNone(resolved)) {
      return yield* errorLine(
        1,
        "Not authenticated. Run `rata auth login --with-token`, or set LINEAR_API_KEY.",
      )
    }
    const client = yield* LinearClient
    const viewer = yield* client.viewer
    const file = yield* auth.storePath
    if (config.json) {
      return yield* writeJson({
        authenticated: true,
        source: resolved.value.source,
        storePath: file,
        viewer,
      })
    }
    return yield* writeLine(
      `Authenticated as ${viewer.name} <${viewer.email}> in ${viewer.organization.name} via ${resolved.value.source}.`,
    )
  }).pipe(Effect.catch(reportFailure)),
).pipe(Command.withDescription("Show the authenticated viewer and the key source"))

const logoutCommand = Command.make("logout", { json: jsonFlag }, (config) =>
  Effect.gen(function* logout() {
    const auth = yield* Auth
    const removed = yield* auth.logout
    if (config.json) {
      return yield* writeJson({ removed })
    }
    return yield* writeLine(
      removed ? "Removed the stored Linear API key." : "No stored Linear API key.",
    )
  }).pipe(Effect.catch(reportFailure)),
).pipe(Command.withDescription("Remove the stored Linear API key"))

const authCommand = Command.make("auth").pipe(
  Command.withDescription("Manage Linear authentication"),
  Command.withSubcommands([loginCommand, statusCommand, logoutCommand]),
)

const whoamiCommand = Command.make("whoami", { json: jsonFlag }, (config) =>
  Effect.gen(function* whoami() {
    const client = yield* LinearClient
    const viewer = yield* client.viewer
    if (config.json) {
      return yield* writeJson(viewer)
    }
    return yield* writeLine(`${viewer.name} <${viewer.email}>`)
  }).pipe(Effect.catch(reportFailure)),
).pipe(Command.withDescription("Print the authenticated Linear viewer"))

export { authCommand, whoamiCommand }
