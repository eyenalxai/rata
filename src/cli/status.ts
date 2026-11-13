import { Effect, Option } from "effect"
import { Command } from "effect/cli"
import { EOL } from "node:os"

import type { KeySource } from "@/config/auth"
import type { DefaultsDocument } from "@/config/defaults"

import { LinearClient } from "@/api/client"
import { TeamService } from "@/api/team"
import { arrayField, objectField, scalarField } from "@/cli/field/shape"
import { OutputFields, readFields, selectObject } from "@/cli/fields"
import { JsonOutput, reportFailure, warningLine, writeJson, writeLine } from "@/cli/output"
import { Auth } from "@/config/auth"
import { defaultsDocument, formatDefaults, issueDefaults } from "@/config/defaults"
import { currentDirectory, RepoConfigService } from "@/config/repo"
import { RepositoryIdentity } from "@/config/repo-identity"

type StatusViewer = {
  readonly id: string
  readonly name: string
  readonly displayName: string
  readonly email: string
  readonly organization: {
    readonly id: string
    readonly name: string
    readonly urlKey: string
  }
}

type StatusDocument = {
  readonly repository: {
    readonly root: string
    readonly linked: boolean
  }
  readonly workspace: {
    readonly name: string | null
    readonly keySource: KeySource
  }
  readonly viewer: StatusViewer
  readonly team: {
    readonly id: string
    readonly key: string
    readonly name: string
  } | null
  readonly project: string | null
  readonly defaults: DefaultsDocument | null
  readonly warning: string | null
}

const labelWidth = 11

const defaultsShape = objectField({
  assignee: scalarField,
  labels: arrayField(scalarField),
  priority: scalarField,
})

const statusShape = objectField({
  repository: objectField({
    root: scalarField,
    linked: scalarField,
  }),
  workspace: objectField({
    name: scalarField,
    keySource: scalarField,
  }),
  viewer: objectField({
    id: scalarField,
    name: scalarField,
    displayName: scalarField,
    email: scalarField,
    organization: objectField({
      id: scalarField,
      name: scalarField,
      urlKey: scalarField,
    }),
  }),
  team: objectField({
    id: scalarField,
    key: scalarField,
    name: scalarField,
  }),
  project: scalarField,
  defaults: defaultsShape,
  warning: scalarField,
})

const row = (label: string, value: string): string =>
  `${label}${" ".repeat(labelWidth - label.length)}${value}`

const statusCommand = Command.make("status", {}, () =>
  Effect.gen(function* status() {
    const json = yield* JsonOutput
    const fields = yield* readFields(json, yield* OutputFields)
    const auth = yield* Auth
    const repoConfig = yield* RepoConfigService
    const identity = yield* RepositoryIdentity
    const client = yield* LinearClient
    const teams = yield* TeamService

    const directory = yield* currentDirectory
    const location = yield* identity.locate(directory)
    const config = Option.getOrUndefined(yield* repoConfig.read(directory))
    const resolved = yield* auth.require
    const viewer = yield* client.viewer
    const storedTeamKey = config?.team
    const linked = storedTeamKey !== undefined
    const team =
      storedTeamKey === undefined
        ? null
        : yield* teams
            .byKey(storedTeamKey)
            .pipe(Effect.catchTag("TeamNotFoundError", () => Effect.succeed(null)))
    const warning =
      storedTeamKey === undefined || team !== null
        ? null
        : `The stored team key ${storedTeamKey} no longer exists. Run \`rata team list\` to see the team keys, then run \`rata link --team <key>\` to repair the link.`
    const defaults =
      config === undefined || storedTeamKey === undefined || team === null
        ? null
        : defaultsDocument(issueDefaults(config))
    const project = linked ? (config?.project ?? null) : null
    const document: StatusDocument = {
      repository: { root: location.root, linked },
      workspace: {
        name: Option.getOrNull(resolved.profile),
        keySource: resolved.keySource,
      },
      viewer: {
        id: viewer.id,
        name: viewer.name,
        displayName: viewer.displayName,
        email: viewer.email,
        organization: viewer.organization,
      },
      team: team === null ? null : { id: team.id, key: team.key, name: team.name },
      project,
      defaults,
      warning,
    }
    if (json) {
      return yield* writeJson(yield* selectObject(fields, statusShape, document))
    }
    if (warning !== null) {
      yield* warningLine(warning)
    }
    const workspace = Option.getOrElse(resolved.profile, () => "none")
    const key =
      resolved.keySource === "env"
        ? "env LINEAR_API_KEY"
        : `profile ${workspace} (${resolved.keySource})`
    const teamLine =
      team === null
        ? storedTeamKey === undefined
          ? "not linked (run rata link)"
          : `missing key ${storedTeamKey} (run rata link --team ${storedTeamKey})`
        : `${team.key} (${team.name})`
    return yield* writeLine(
      [
        row("repo:", location.root),
        row("workspace:", workspace),
        row("api key:", key),
        row("team:", teamLine),
        row("project:", project ?? "none"),
        row("defaults:", defaults === null ? "none" : formatDefaults(defaults)),
        row("viewer:", `${viewer.name} <${viewer.email}>`),
        row("org:", `${viewer.organization.name} (${viewer.organization.urlKey})`),
      ].join(EOL),
    )
  }).pipe(Effect.catch(reportFailure)),
).pipe(
  Command.withDescription("Show the repository, workspace, team and viewer that rata uses"),
  Command.withGlobalFlags([JsonOutput, OutputFields]),
  Command.withExamples([
    {
      command: "rata status",
      description: "Show the current context in one call",
    },
    {
      command: "rata status --json",
      description: "Print the context for an agent",
    },
  ]),
)

export { statusCommand }
