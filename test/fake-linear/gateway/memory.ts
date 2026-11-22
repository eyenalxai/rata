import type {
  MemoryIssue,
  MemoryLabel,
  MemoryProject,
  MemorySeed,
  MemoryTeam,
} from "@test/fake-linear/gateway/model"

import { byPriority, matchesIssue, toDetail, withRelations } from "@test/fake-linear/gateway/issue"
import { defaultPriorities } from "@test/fake-linear/gateway/model"
import { Effect, Layer } from "effect"

import type { Connection } from "@/linear/connection"
import type { TeamDetail } from "@/linear/decode/team"
import type { LinearGatewayShape } from "@/linear/gateway"

import { isUuid } from "@/domain/id"
import { LinearGraphQLError } from "@/linear/errors"
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
  members: [...(team.members ?? [])],
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

  const execute = (() => Effect.fail(unsupported())) as LinearGatewayShape["client"]["execute"]
  const executeWithKey = (() =>
    Effect.fail(unsupported())) as LinearGatewayShape["client"]["executeWithKey"]
  const viewer = Effect.succeed(seed.viewer)

  const client: LinearGatewayShape["client"] = {
    execute,
    executeWithKey,
    viewer,
    viewerWithKey: () => viewer,
    withKey: () => client,
  }

  const gateway: LinearGatewayShape = {
    client,
    viewer,
    viewerWithKey: () => viewer,
    issue: {
      id: (ref) => requireIssue(String(ref)).pipe(Effect.map((issue) => issue.summary.id)),
      summary: (ref) => requireIssue(String(ref)).pipe(Effect.map((issue) => issue.summary)),
      show: (ref, options) =>
        requireIssue(String(ref)).pipe(Effect.map((issue) => toDetail(issue, options))),
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
    withKey: () => gateway,
  }
  return gateway
}

const memoryGatewayLayer = (seed: MemorySeed): Layer.Layer<LinearGateway> =>
  Layer.succeed(LinearGateway, makeMemoryGateway(seed))

export { makeMemoryGateway, memoryGatewayLayer }
