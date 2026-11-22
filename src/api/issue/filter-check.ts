import { Effect, Schema } from "effect"

import type { IssueListOptions } from "@/api/issue-model"
import type { TeamContext } from "@/context/team"
import type { TeamId } from "@/domain/id"
import type { LinearApiError } from "@/linear/errors"
import type { LinearGatewayShape } from "@/linear/gateway"

import { isUuid, UserId, userId } from "@/domain/id"
import { pageSize } from "@/linear/connection"

const filterNames = ["state", "label", "project"] as const
type FilterName = (typeof filterNames)[number]

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
    id: UserId,
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

const projectNames = (
  gateway: LinearGatewayShape,
): Effect.Effect<readonly string[], LinearApiError> =>
  gateway.project
    .list({ after: null, limit: pageSize, all: true })
    .pipe(Effect.map((projects) => uniqueNames(projects.nodes.map((project) => project.name))))

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
  gateway: LinearGatewayShape,
  context: TeamContext["Service"],
  teamId: TeamId,
  options: Pick<IssueListOptions, "state" | "label" | "project">,
) {
  if (options.state !== undefined) {
    yield* context.resolveState(options.state, teamId)
  }
  if (options.label !== undefined) {
    yield* context.resolveLabel(options.label, teamId)
  }
  if (options.project !== undefined && !isUuid(options.project)) {
    yield* requireName("project", options.project, yield* projectNames(gateway))
  }
})

const resolveAssignee = Effect.fn("IssueFilters.resolveAssignee")(function* resolveAssigneeId(
  gateway: LinearGatewayShape,
  value: string,
) {
  if (!isUuid(value)) {
    return yield* new AssigneeInputError({
      message: "The --assignee flag accepts `me` or a user UUID.",
    })
  }
  const found = yield* gateway.user.byId(userId(value))
  if (found === undefined) {
    return yield* new AssigneeNotFoundError({
      id: userId(value),
      message: `No user with id ${value}.`,
    })
  }
  return found
})

export {
  AssigneeInputError,
  AssigneeNotFoundError,
  FilterNameNotFoundError,
  resolveAssignee,
  validateNamedFilters,
}
