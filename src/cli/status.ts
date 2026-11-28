import { DateTime, Effect, Option } from "effect"
import { Flag } from "effect/cli"
import { EOL } from "node:os"

import type { Surface } from "@/cli/surface"
import type { KeySource, ResolvedAuth } from "@/config/auth"
import type { DefaultsDocument } from "@/config/defaults"
import type { RepoConfig } from "@/config/repo/model"
import type { ContextDocs, TriageMap } from "@/context/docs"
import type { ResolvedTeamContext } from "@/context/team/model"
import type { TeamLabel, TeamState } from "@/linear/decode/team"

import { trackerCommandWarning } from "@/cli/docs/check"
import { warningLine } from "@/cli/output"
import { defineCommand, selectOutput } from "@/cli/spec"
import { statusShape } from "@/cli/status/shape"
import { Auth } from "@/config/auth"
import { defaultsDocument, formatDefaults } from "@/config/defaults"
import { currentDirectory, RepoConfigService } from "@/config/repo"
import { RepositoryIdentity } from "@/config/repo-identity"
import { readContextDocs } from "@/context/docs"
import { TeamContext } from "@/context/team"
import { issueDefaults } from "@/domain/issue-defaults"

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

type StatusTeam = {
  readonly id: string
  readonly key: string
  readonly name: string
}

type StatusCache = {
  readonly ageSeconds: number
  readonly fetchedAt: string
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
  readonly team: StatusTeam | null
  readonly project: string | null
  readonly defaults: DefaultsDocument | null
  readonly states: readonly TeamState[]
  readonly labels: readonly TeamLabel[]
  readonly triage: TriageMap | null
  readonly cache: StatusCache | null
  readonly docs: ContextDocs["docs"]
  readonly warning: string | null
}

type StatusInput = {
  readonly root: string
  readonly repo: RepoConfig | undefined
  readonly resolved: ResolvedAuth
  readonly context: ResolvedTeamContext
  readonly docs: ContextDocs
}

const refreshFlag = Flag.Boolean("refresh").pipe(
  Flag.withDescription("Read the team context from Linear and update the cache"),
  Flag.withDefault(false),
)

const labelWidth = 11

const row = (label: string, value: string): string =>
  `${label}${" ".repeat(labelWidth - label.length)}${value}`

const names = (values: readonly { readonly name: string }[]): string => {
  if (values.length === 0) {
    return "none"
  }
  return values.map((value) => value.name).join(", ")
}

const docStatus = (health: ContextDocs["docs"]["tracker"]): string => {
  if (!health.exists) {
    return "missing"
  }
  return health.healthy === true ? "ok" : "warn"
}

const docsLine = (docs: ContextDocs["docs"]): string =>
  `tracker ${docStatus(docs.tracker)}, triage ${docStatus(docs.triage)}`

const statusWarning = (teamWarning: string | null, docs: ContextDocs["docs"]): string | null => {
  const warnings = [teamWarning, docs.tracker.warning, docs.triage.warning].filter(
    (warning): warning is string => warning !== null,
  )
  return warnings.length === 0 ? null : warnings.join(" ")
}

const teamSummary = (team: ResolvedTeamContext["team"]): StatusTeam | null =>
  team === null ? null : { id: team.detail.id, key: team.detail.key, name: team.detail.name }

const statusCache = (team: ResolvedTeamContext["team"]): StatusCache | null =>
  team === null
    ? null
    : {
        ageSeconds: team.ageSeconds,
        fetchedAt: DateTime.formatIso(DateTime.makeUnsafe(team.fetchedAt)),
      }

const statusDocument = (input: StatusInput): StatusDocument => {
  const { repo, resolved, context, docs } = input
  const storedTeam = repo?.team ?? repo?.teamId
  const linked = storedTeam !== undefined
  const team = context.team
  const isLinked = repo !== undefined && storedTeam !== undefined && team !== null
  return {
    repository: { root: input.root, linked },
    workspace: { name: Option.getOrNull(resolved.profile), keySource: resolved.keySource },
    viewer: {
      id: context.viewer.id,
      name: context.viewer.name,
      displayName: context.viewer.displayName,
      email: context.viewer.email,
      organization: context.viewer.organization,
    },
    team: teamSummary(team),
    project: linked ? (repo?.project ?? null) : null,
    defaults: isLinked ? defaultsDocument(issueDefaults(repo)) : null,
    states: team?.detail.states ?? [],
    labels: team?.detail.labels ?? [],
    triage: docs.triage,
    cache: statusCache(team),
    docs: docs.docs,
    warning: statusWarning(context.warning, docs.docs),
  }
}

const apiKeyLine = (keySource: KeySource, profile: string | null): string =>
  keySource === "env" ? "env LINEAR_API_KEY" : `profile ${profile ?? "none"} (${keySource})`

const teamLine = (team: StatusTeam | null, storedTeam: string | undefined): string => {
  if (team !== null) {
    return `${team.key} (${team.name})`
  }
  if (storedTeam === undefined) {
    return "not linked (run rata admin link)"
  }
  return `missing key ${storedTeam} (run rata admin link --team ${storedTeam})`
}

const triageLine = (triage: TriageMap | null): string =>
  triage === null ? "none" : `${Object.keys(triage.roles).length} roles (${triage.source})`

const cacheLine = (cache: StatusCache | null): string =>
  cache === null ? "none" : `${cache.ageSeconds}s old`

const statusText = (document: StatusDocument, storedTeam: string | undefined): string =>
  [
    row("repo:", document.repository.root),
    row("workspace:", document.workspace.name ?? "none"),
    row("api key:", apiKeyLine(document.workspace.keySource, document.workspace.name)),
    row("team:", teamLine(document.team, storedTeam)),
    row("project:", document.project ?? "none"),
    row("defaults:", document.defaults === null ? "none" : formatDefaults(document.defaults)),
    row("states:", names(document.states)),
    row("labels:", names(document.labels)),
    row("triage:", triageLine(document.triage)),
    row("cache:", cacheLine(document.cache)),
    row("docs:", docsLine(document.docs)),
    row("viewer:", `${document.viewer.name} <${document.viewer.email}>`),
    row("org:", `${document.viewer.organization.name} (${document.viewer.organization.urlKey})`),
  ].join(EOL)

const statusSpec = (surface: () => Surface) =>
  defineCommand("status", {
    summary: "Show the repository, workspace, team context and tracker document health",
    examples: [
      {
        command: "rata status",
        description: "Show the cached context in one call",
      },
      {
        command: "rata status --format json",
        description: "Print the context for an agent",
      },
      {
        command: "rata status --refresh",
        description: "Read the team context from Linear and update the cache",
      },
    ],
    input: { refresh: refreshFlag },
    output: selectOutput(statusShape),
    run: (input, control) =>
      Effect.gen(function* status() {
        const auth = yield* Auth
        const repoConfig = yield* RepoConfigService
        const identity = yield* RepositoryIdentity
        const teamContext = yield* TeamContext

        const directory = yield* currentDirectory
        const location = yield* identity.locate(directory)
        const resolved = yield* auth.require
        const context = yield* teamContext.resolve({ refresh: input.refresh })
        const repo = Option.getOrUndefined(yield* repoConfig.read(directory))
        const docs = yield* readContextDocs(location.root, (content, file) =>
          trackerCommandWarning(content, surface(), file),
        )
        const document = statusDocument({ root: location.root, repo, resolved, context, docs })
        if (control.format === "text" && document.warning !== null) {
          yield* warningLine(document.warning)
        }
        return {
          kind: "resource",
          value: document,
          text: [statusText(document, repo?.team ?? repo?.teamId)],
        }
      }),
  })

export { statusSpec }
