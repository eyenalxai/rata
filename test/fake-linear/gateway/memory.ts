import type {
  MemoryIssue,
  MemoryLabel,
  MemoryProject,
  MemorySeed,
  MemoryTeam,
} from "@test/fake-linear/gateway/model"
import type { MemoryWriteState } from "@test/fake-linear/gateway/write"

import {
  byPriority,
  matchesIssue,
  relationConnections,
  summaryNode,
  toFullWorking,
  toWorking,
  withRelations,
} from "@test/fake-linear/gateway/issue"
import { defaultPriorities } from "@test/fake-linear/gateway/model"
import {
  changeLabel,
  createComment,
  createRelation,
  deleteRelation,
  updateIssue,
} from "@test/fake-linear/gateway/write"
import { Effect, Option, Redacted, Schema } from "effect"

import type { Connection } from "@/linear/connection"
import type { TeamDetail } from "@/linear/decode/team"
import type { LinearGatewayShape } from "@/linear/gateway"

import { isUuid } from "@/domain/id"
import { LinearAuthError, LinearGraphQLError } from "@/linear/errors"

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

const unsupported = (
  message = "The in-memory Linear gateway does not execute raw GraphQL documents.",
): LinearGraphQLError => new LinearGraphQLError({ message, details: [] })

const operationName = (query: string): string | undefined =>
  /(?:query|mutation)\s+(?<name>[A-Za-z0-9_]+)/u.exec(query)?.groups?.name

const IssueIdInput = Schema.Struct({ id: Schema.String })
const IssueRefsInput = Schema.Struct({
  filter: Schema.Struct({ id: Schema.Struct({ in: Schema.Array(Schema.String) }) }),
})
const CommentByIdInput = Schema.Struct({
  filter: Schema.Struct({ id: Schema.Struct({ eq: Schema.String }) }),
})

const decodeVariables = <S extends Schema.ConstraintDecoder<unknown>>(
  schema: S,
  value: unknown,
): S["Type"] => {
  const decoded = Schema.decodeUnknownOption(schema)(value)
  if (Option.isNone(decoded)) {
    throw unsupported("The query variables are not valid.")
  }
  return decoded.value
}

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

const runWrite = (write: () => Record<string, unknown>) =>
  Effect.try({
    try: write,
    catch: (error) =>
      Schema.is(LinearGraphQLError)(error)
        ? error
        : new LinearGraphQLError({ message: String(error), details: [] }),
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

  const writeState: MemoryWriteState = {
    viewer: seed.viewer,
    issues,
    teams,
    labels,
    projects,
  }

  const pageInfo = { hasNextPage: false, endCursor: null }

  const issueOrThrow = (ref: string): MemoryIssue => {
    const issue = findIssue(ref)
    if (issue === undefined) {
      throw new LinearGraphQLError({ message: `No issue matches ${ref}.`, details: [] })
    }
    return issue
  }

  const queryCommentById = (input: typeof CommentByIdInput.Type) => {
    const comment = issues
      .flatMap((issue) => issue.comments ?? [])
      .find((candidate) => String(candidate.id) === input.filter.id.eq)
    return {
      comments: { nodes: comment === undefined ? [] : [comment], pageInfo },
    }
  }

  const queryIssueRefs = (input: typeof IssueRefsInput.Type) => {
    const refs = new Set(input.filter.id.in.map(String))
    const nodes = issues
      .filter((issue) => refs.has(String(issue.summary.id)) || refs.has(issue.summary.identifier))
      .map((issue) => ({ id: issue.summary.id, identifier: issue.summary.identifier }))
    return { issues: { nodes, pageInfo } }
  }

  const queryIssueBody = (input: typeof IssueIdInput.Type) => {
    const issue = issueOrThrow(input.id)
    return {
      issue: {
        id: issue.summary.id,
        identifier: issue.summary.identifier,
        description: issue.description,
        updatedAt: issue.summary.updatedAt,
      },
    }
  }

  const execute = ((query: string, variables: Record<string, unknown>) => {
    const failure = seed.failOn?.find((fragment) => query.includes(fragment))
    if (failure !== undefined) {
      return Effect.fail(
        new LinearGraphQLError({
          message: `The in-memory Linear gateway was told to fail ${failure}.`,
          details: [],
        }),
      )
    }
    const operation = operationName(query)
    if (operation === undefined) {
      return Effect.fail(unsupported())
    }
    switch (operation) {
      case "IssueRelationsWithInverse": {
        return runWrite(() => {
          const issue = findIssue(decodeVariables(IssueIdInput, variables).id)
          return issue === undefined
            ? {
                issue: {
                  relations: { nodes: [], pageInfo },
                  inverseRelations: { nodes: [], pageInfo },
                },
              }
            : { issue: relationConnections(issue) }
        })
      }
      case "IssueRelations": {
        return runWrite(() => {
          const issue = findIssue(decodeVariables(IssueIdInput, variables).id)
          return {
            issue: {
              relations:
                issue === undefined
                  ? { nodes: [], pageInfo }
                  : relationConnections(issue).relations,
            },
          }
        })
      }
      case "IssueInverseRelations": {
        return runWrite(() => {
          const issue = findIssue(decodeVariables(IssueIdInput, variables).id)
          return {
            issue: {
              inverseRelations:
                issue === undefined
                  ? { nodes: [], pageInfo }
                  : relationConnections(issue).inverseRelations,
            },
          }
        })
      }
      case "IssueRefs": {
        return runWrite(() => queryIssueRefs(decodeVariables(IssueRefsInput, variables)))
      }
      case "CommentById": {
        return runWrite(() => queryCommentById(decodeVariables(CommentByIdInput, variables)))
      }
      case "IssueBody": {
        return runWrite(() => queryIssueBody(decodeVariables(IssueIdInput, variables)))
      }
      case "UpdateIssue": {
        return runWrite(() => updateIssue(writeState, variables))
      }
      case "AddLabel": {
        return runWrite(() => changeLabel(writeState, variables, "add"))
      }
      case "RemoveLabel": {
        return runWrite(() => changeLabel(writeState, variables, "remove"))
      }
      case "CreateComment": {
        return runWrite(() => createComment(writeState, variables))
      }
      case "IssueRelationCreate": {
        return runWrite(() => createRelation(writeState, variables))
      }
      case "IssueRelationDelete": {
        return runWrite(() => deleteRelation(writeState, variables))
      }
      default: {
        return Effect.fail(
          unsupported(`The in-memory Linear gateway does not execute ${query.slice(0, 60)}.`),
        )
      }
    }
  }) as LinearGatewayShape["client"]["execute"]
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
        const workingPageInfo = { hasNextPage: false, endCursor: null }
        return Effect.succeed(
          options.mode === "summary"
            ? {
                mode: "summary" as const,
                nodes: matching.map(summaryNode),
                pageInfo: workingPageInfo,
              }
            : options.mode === "full"
              ? {
                  mode: "full" as const,
                  nodes: matching.map((issue) => toFullWorking(issue, issues, options)),
                  pageInfo: workingPageInfo,
                }
              : {
                  mode: "working" as const,
                  nodes: matching.map((issue) => toWorking(issue, issues, options)),
                  pageInfo: workingPageInfo,
                },
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

export { makeMemoryGateway }
