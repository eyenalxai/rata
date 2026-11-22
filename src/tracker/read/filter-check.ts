import { Effect } from "effect"

import type { TeamResolutionError } from "@/api/team"
import type {
  ContextLabelNotFoundError,
  ContextStateNotFoundError,
  ResolvedContext,
} from "@/context/model"
import type { ContextResolver } from "@/context/resolve"
import type { ContextResolveError } from "@/context/resolve/model"
import type { LinearApiError } from "@/linear/errors"
import type { LinearGatewayShape } from "@/linear/gateway"
import type { FilterName } from "@/tracker/error"
import type { IssueListOptions } from "@/tracker/model"

import { isUuid } from "@/domain/id"
import { pageSize } from "@/linear/connection"
import { FilterNameNotFoundError } from "@/tracker/error"
import { resolveLabelName, resolveStateName } from "@/tracker/resolve"

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

const validateNamedFilters = Effect.fn("TrackerFilters.validateNames")(function* validateNames(
  gateway: LinearGatewayShape,
  resolver: ContextResolver["Service"],
  context: ResolvedContext,
  options: Pick<IssueListOptions, "state" | "label" | "project">,
): Effect.fn.Return<
  void,
  | ContextLabelNotFoundError
  | ContextResolveError
  | ContextStateNotFoundError
  | FilterNameNotFoundError
  | LinearApiError
  | TeamResolutionError
> {
  if (options.state !== undefined) {
    yield* resolveStateName(resolver, context, options.state)
  }
  if (options.label !== undefined) {
    yield* resolveLabelName(resolver, context, options.label)
  }
  if (options.project !== undefined && !isUuid(options.project)) {
    yield* requireName("project", options.project, yield* projectNames(gateway))
  }
})

export { validateNamedFilters }
