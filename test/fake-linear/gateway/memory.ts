import type {
  MemoryIssue,
  MemoryLabel,
  MemoryProject,
  MemorySeed,
  MemoryTeam,
} from "@test/fake-linear/gateway/model"

import { byPriority, matchesIssue, toWorking, withRelations } from "@test/fake-linear/gateway/issue"
import { defaultPriorities } from "@test/fake-linear/gateway/model"
import { Effect, Layer, Option, Redacted, Schema } from "effect"

import type { Connection } from "@/linear/connection"
import type { TeamDetail } from "@/linear/decode/team"
import type { LinearGatewayShape } from "@/linear/gateway"

import { isUuid } from "@/domain/id"
import { LinearAuthError, LinearGraphQLError } from "@/linear/errors"
import { LinearGateway } from "@/linear/gateway"

const paginate = <A extends { readonly id: string }>(
  nodes: readonly A[],
  options: {
    readonly after: string | null
    readonly limit: number
    readonly all?: boolean | undefined
  },
): Connection<A> => {
  const start =
    options.after === null ? 0 : nodes.findIndex((node) => node.id === options.after) + 1
  if (options.all === true) {
    return { nodes: nodes.slice(start), pageInfo: { hasNextPage: false, endCursor: null } }
  }
  const page = nodes.slice(start, start + options.limit)
  return {
    nodes: page,
    pageInfo: {
      hasNextPage: start + page.length < nodes.length,
      endCursor: page.at(-1)?.id ?? null,
    },
  }
}

const labelView = (label: MemoryLabel) => ({
  id: label.id,
  name: label.name,
  color: label.color,
})

const projectVisible = (project: MemoryProject, teamId: string | undefined): boolean =>
  teamId === undefined ||
  project.teams === undefined ||
  project.teams.some((team) => team === teamId)

const unsupported = (): LinearGraphQLError =>
  new LinearGraphQLError({
    message: "The in-memory Linear gateway does not execute raw GraphQL documents.",
    details: [],
  })

const teamDetail = (team: MemoryTeam, labels: readonly MemoryLabel[]): TeamDetail => ({
  id: team.id,
  key: team.key,
  name: team.name,
  timezone: team.timezone,
  states: [...(team.states ?? [])].toSorted((left, right) => left.position - right.position),
  labels:
    team.labels ??
    labels
      .filter((label) => label.teamId === team.id || label.teamId === null)
      .map((label) => ({
        id: label.id,
        name: label.name,
        color: label.color,
        scope: label.teamId === null ? ("workspace" as const) : ("team" as const),
      })),
  members: (team.members ?? [])
    .filter((member) => member.active !== false)
    .map(({ active: _active, ...member }) => member),
  priorities: [...(team.priorities ?? defaultPriorities)].toSorted(
    (left, right) => left.priority - right.priority,
  ),
})

const makeMemoryGateway = (seed: MemorySeed): LinearGatewayShape => {
  const issues = [...(seed.issues ?? [])]
  const teams = [...seed.teams]
  const labels = [...seed.labels]
  const projects = [...(seed.projects ?? [])]

  const findIssue = (ref: string): MemoryIssue | undefined =>
    issues.find((issue) => String(issue.summary.id) === ref || issue.summary.identifier === ref)

  const requireIssue = (ref: string): Effect.Effect<MemoryIssue, LinearGraphQLError> => {
    const issue = findIssue(ref)
    return issue === undefined
      ? Effect.fail(new LinearGraphQLError({ message: `No issue matches ${ref}.`, details: [] }))
      : Effect.succeed(issue)
  }

  const updateIssueState = (variables: Record<string, unknown>) => {
    const input = Option.getOrUndefined(
      Schema.decodeUnknownOption(Schema.Struct({ stateId: Schema.String }))(variables.input),
    )
    if (input === undefined) {
      return Effect.fail(unsupported())
    }
    const index = issues.findIndex((issue) => String(issue.summary.id) === String(variables.id))
    const issue = issues[index]
    const state =
      issue === undefined
        ? undefined
        : (teams.find((team) => team.id === issue.team.id)?.states ?? []).find(
            (candidate) => candidate.id === input.stateId,
          )
    if (issue === undefined || state === undefined) {
      return Effect.fail(unsupported())
    }
    const updated: MemoryIssue = {
      ...issue,
      summary: { ...issue.summary, state: { name: state.name, type: state.type } },
    }
    issues[index] = updated
    return Effect.succeed({ issueUpdate: { success: true, issue: updated.summary } })
  }

  const execute = ((query: string, variables: Record<string, unknown>) =>
    query.includes("mutation UpdateIssue")
      ? updateIssueState(variables)
      : Effect.fail(unsupported())) as LinearGatewayShape["client"]["execute"]
  const executeWithKey = (() =>
    Effect.fail(unsupported())) as LinearGatewayShape["client"]["executeWithKey"]
  const viewer = Effect.succeed(seed.viewer)
  const rejectedKeys = new Set<string>(seed.rejectedKeys)

  const workspaceFor = (apiKey: Redacted.Redacted) => seed.workspaces?.[Redacted.value(apiKey)]

  const viewerWithKey = (apiKey: Redacted.Redacted) => {
    const workspace = workspaceFor(apiKey)
    return rejectedKeys.has(Redacted.value(apiKey))
      ? Effect.fail(new LinearAuthError({ message: "Linear rejected the API key.", status: 401 }))
      : Effect.succeed(workspace?.viewer ?? seed.viewer)
  }

  const client: LinearGatewayShape["client"] = {
    execute,
    executeWithKey,
    viewer,
    viewerWithKey,
    withKey: () => client,
  }

  const gateway: LinearGatewayShape = {
    client,
    viewer,
    viewerWithKey,
    issue: {
      id: (ref) => requireIssue(String(ref)).pipe(Effect.map((issue) => issue.summary.id)),
      summary: (ref) => requireIssue(String(ref)).pipe(Effect.map((issue) => issue.summary)),
      labels: (ref) =>
        requireIssue(String(ref)).pipe(Effect.map((issue) => issue.summary.labels.nodes)),
      teamId: (issueId) => requireIssue(String(issueId)).pipe(Effect.map((issue) => issue.team.id)),
      list: (options) => {
        const matching = issues.filter((issue) => matchesIssue(issue, options))
        const sorted =
          options.sort === "priority"
            ? matching.toSorted((left, right) => byPriority(left.summary, right.summary))
            : matching
        return Effect.succeed(
          paginate(
            sorted.map((issue) => withRelations(issue, options.include)),
            options,
          ),
        )
      },
      search: (term, options) => {
        const text = term.toLowerCase()
        const matching = issues.filter(
          (issue) =>
            issue.team.id === options.teamId &&
            (issue.summary.title.toLowerCase().includes(text) ||
              (issue.description ?? "").toLowerCase().includes(text)),
        )
        return Effect.succeed(
          paginate(
            matching.map((issue) => issue.summary),
            options,
          ),
        )
      },
      workingSet: (refs, options) => {
        const requested = new Set(refs.map(String))
        const matching = issues.filter(
          (issue) =>
            requested.has(String(issue.summary.id)) || requested.has(issue.summary.identifier),
        )
        return Effect.succeed({
          nodes: matching.map((issue) => toWorking(issue, issues, options.comments)),
          pageInfo: { hasNextPage: false, endCursor: null },
        })
      },
    },
    team: {
      list: (options) => Effect.succeed(paginate(teams, options)),
      byKey: (ref) =>
        Effect.succeed(teams.find((team) => (isUuid(ref) ? team.id === ref : team.key === ref))),
      byName: (name) =>
        Effect.succeed(teams.find((team) => team.name.toLowerCase() === name.toLowerCase())),
      byId: (id) => Effect.succeed(teams.find((team) => team.id === id)),
      details: (team) => {
        const found = teams.find((candidate) => candidate.id === team.id)
        return found === undefined
          ? Effect.fail(
              new LinearGraphQLError({ message: `No team with id ${team.id}.`, details: [] }),
            )
          : Effect.succeed(teamDetail(found, labels))
      },
    },
    label: {
      list: (teamId, options) =>
        Effect.succeed(
          paginate(labels.filter((label) => label.teamId === teamId).map(labelView), options),
        ),
      listAvailable: (teamId, options) =>
        Effect.succeed(
          paginate(
            labels
              .filter((label) => label.teamId === teamId || label.teamId === null)
              .map(labelView),
            options,
          ),
        ),
    },
    project: {
      list: (options) =>
        Effect.succeed(
          paginate(
            projects.filter(
              (project) =>
                (options.includeArchived === true || !project.trashed) &&
                projectVisible(project, options.teamId),
            ),
            options,
          ),
        ),
      byId: (id) => Effect.succeed(projects.find((project) => project.id === id)),
    },
    user: {
      byId: (id) => {
        const known =
          id === seed.viewer.id ||
          issues.some((issue) => issue.summary.assignee?.id === id) ||
          teams.some((team) => (team.members ?? []).some((member) => member.id === id))
        return Effect.succeed(known ? id : undefined)
      },
    },
    withKey: (apiKey) => {
      const workspace = workspaceFor(apiKey)
      if (workspace === undefined) {
        return gateway
      }
      return makeMemoryGateway({
        viewer: workspace.viewer ?? seed.viewer,
        teams: workspace.teams ?? seed.teams,
        labels: workspace.labels ?? seed.labels,
        ...((workspace.projects ?? seed.projects) === undefined
          ? {}
          : { projects: workspace.projects ?? seed.projects ?? [] }),
        ...((workspace.issues ?? seed.issues) === undefined
          ? {}
          : { issues: workspace.issues ?? seed.issues ?? [] }),
        ...(seed.rejectedKeys === undefined ? {} : { rejectedKeys: seed.rejectedKeys }),
      })
    },
  }
  return gateway
}

const memoryGatewayLayer = (seed: MemorySeed): Layer.Layer<LinearGateway> =>
  Layer.succeed(LinearGateway, makeMemoryGateway(seed))

export { makeMemoryGateway, memoryGatewayLayer }
