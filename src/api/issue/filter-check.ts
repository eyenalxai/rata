import { Effect, Schema } from "effect"

import type { LinearClient } from "@/api/client"
import type { LinearApiError } from "@/api/errors"
import type { IssueListOptions } from "@/api/issue-model"

import { collectConnection, PageInfo, pageSize } from "@/api/pagination"
import { isUuid } from "@/domain/ref"

const filterNames = ["state", "label", "project"] as const
type FilterName = (typeof filterNames)[number]

const StateName = Schema.Struct({ name: Schema.String })
const StateConnection = Schema.Struct({
  nodes: Schema.Array(StateName),
  pageInfo: PageInfo,
})

const LabelName = Schema.Struct({ name: Schema.String })
const LabelConnection = Schema.Struct({
  nodes: Schema.Array(LabelName),
  pageInfo: PageInfo,
})

const ProjectName = Schema.Struct({ name: Schema.String })
const ProjectConnection = Schema.Struct({
  nodes: Schema.Array(ProjectName),
  pageInfo: PageInfo,
})

const UserConnection = Schema.Struct({
  nodes: Schema.Array(Schema.Struct({ id: Schema.String })),
})
const UserResponse = Schema.Struct({ users: UserConnection })

const statesQuery = `query TeamStates($teamId: String!, $first: Int!, $after: String) {
  team(id: $teamId) {
    states(first: $first, after: $after) {
      nodes { name }
      pageInfo { hasNextPage endCursor }
    }
  }
}`

const labelsQuery = `query AvailableLabels($teamId: ID!, $first: Int!, $after: String) {
  issueLabels(first: $first, after: $after, filter: { or: [{ team: { id: { eq: $teamId } } }, { team: { null: true } }] }) {
    nodes { name }
    pageInfo { hasNextPage endCursor }
  }
}`

const projectsQuery = `query Projects($first: Int!, $after: String) {
  projects(first: $first, after: $after, includeArchived: false) {
    nodes { name }
    pageInfo { hasNextPage endCursor }
  }
}`

const userByIdQuery = `query UserById($id: ID!) {
  users(filter: { id: { eq: $id } }, includeDisabled: true, first: 1) {
    nodes { id }
  }
}`

class FilterNameNotFoundError extends Schema.TaggedError<FilterNameNotFoundError>()(
  "FilterNameNotFoundError",
  {
    filter: Schema.Literals(filterNames),
    value: Schema.String,
    valid: Schema.Array(Schema.String),
    message: Schema.String,
  },
) {}

class AssigneeInputError extends Schema.TaggedError<AssigneeInputError>()("AssigneeInputError", {
  message: Schema.String,
}) {}

class AssigneeNotFoundError extends Schema.TaggedError<AssigneeNotFoundError>()(
  "AssigneeNotFoundError",
  {
    id: Schema.String,
    message: Schema.String,
  },
) {}

const uniqueNames = (names: readonly string[]): readonly string[] => {
  const seen = new Set<string>()
  const unique: string[] = []
  for (const name of names) {
    const key = name.toLowerCase()
    if (!seen.has(key)) {
      seen.add(key)
      unique.push(name)
    }
  }
  return unique
}

const stateNames = (
  execute: LinearClient["Service"]["execute"],
  teamId: string,
): Effect.Effect<readonly string[], LinearApiError> =>
  collectConnection((after) =>
    execute(
      statesQuery,
      { teamId, first: pageSize, after },
      Schema.Struct({ team: Schema.Struct({ states: StateConnection }) }),
    ).pipe(Effect.map((data) => data.team.states)),
  ).pipe(Effect.map((states) => uniqueNames(states.map((state) => state.name))))

const labelNames = (
  execute: LinearClient["Service"]["execute"],
  teamId: string,
): Effect.Effect<readonly string[], LinearApiError> =>
  collectConnection((after) =>
    execute(
      labelsQuery,
      { teamId, first: pageSize, after },
      Schema.Struct({ issueLabels: LabelConnection }),
    ).pipe(Effect.map((data) => data.issueLabels)),
  ).pipe(Effect.map((labels) => uniqueNames(labels.map((label) => label.name))))

const projectNames = (
  execute: LinearClient["Service"]["execute"],
): Effect.Effect<readonly string[], LinearApiError> =>
  collectConnection((after) =>
    execute(
      projectsQuery,
      { first: pageSize, after },
      Schema.Struct({ projects: ProjectConnection }),
    ).pipe(Effect.map((data) => data.projects)),
  ).pipe(Effect.map((projects) => uniqueNames(projects.map((project) => project.name))))

const failMissing = (
  filter: FilterName,
  value: string,
  valid: readonly string[],
): Effect.Effect<void, FilterNameNotFoundError> => {
  const message =
    filter === "state"
      ? `No state named ${value} in the team.`
      : filter === "label"
        ? `No label named ${value} in the team or the workspace.`
        : `No project named ${value}.`
  return Effect.fail(new FilterNameNotFoundError({ filter, value, valid, message }))
}

const requireName = (
  filter: FilterName,
  value: string,
  names: readonly string[],
): Effect.Effect<void, FilterNameNotFoundError> =>
  names.some((name) => name.toLowerCase() === value.toLowerCase())
    ? Effect.void
    : failMissing(filter, value, names)

const validateNamedFilters = Effect.fn("IssueFilters.validateNames")(function* validateNames(
  execute: LinearClient["Service"]["execute"],
  teamId: string,
  options: Pick<IssueListOptions, "state" | "label" | "project">,
) {
  if (options.state !== undefined) {
    yield* requireName("state", options.state, yield* stateNames(execute, teamId))
  }
  if (options.label !== undefined) {
    yield* requireName("label", options.label, yield* labelNames(execute, teamId))
  }
  if (options.project !== undefined && !isUuid(options.project)) {
    yield* requireName("project", options.project, yield* projectNames(execute))
  }
})

const resolveAssignee = Effect.fn("IssueFilters.resolveAssignee")(function* resolveAssigneeId(
  execute: LinearClient["Service"]["execute"],
  value: string,
) {
  if (!isUuid(value)) {
    return yield* new AssigneeInputError({
      message: "The --assignee flag accepts `me` or a user UUID.",
    })
  }
  const data = yield* execute(userByIdQuery, { id: value }, UserResponse)
  const user = data.users.nodes[0]
  if (user === undefined) {
    return yield* new AssigneeNotFoundError({
      id: value,
      message: `No user with id ${value}.`,
    })
  }
  return user.id
})

export {
  AssigneeInputError,
  AssigneeNotFoundError,
  FilterNameNotFoundError,
  resolveAssignee,
  validateNamedFilters,
}
