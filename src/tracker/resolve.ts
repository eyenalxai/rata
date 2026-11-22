import { Effect } from "effect"

import type { ResolvedContext, ResolvedTeam } from "@/context/model"
import type { ContextResolver } from "@/context/resolve"
import type { ContextResolveError } from "@/context/resolve/model"
import type { IssueId, TeamId, UserId } from "@/domain/id"
import type { InvalidIssueRef, IssueRef } from "@/domain/issue-ref"
import type { TeamLabel, TeamState } from "@/linear/decode/team"
import type { LinearApiError } from "@/linear/errors"
import type { LinearGatewayShape } from "@/linear/gateway"

import { TeamNotFoundError, TeamResolutionError } from "@/api/team"
import {
  ContextLabelNotFoundError,
  ContextStateNotFoundError,
  findLabelByName,
  findStateByName,
  validNameText,
} from "@/context/model"
import { isUuid, issueId, userId } from "@/domain/id"
import { parseRefOrFail } from "@/domain/issue-ref"
import { AssigneeInputError, AssigneeNotFoundError } from "@/tracker/error"

type ResolvedIssueRef = {
  readonly ref: IssueRef
  readonly id: IssueId
}

const requireTeam = (context: ResolvedContext): Effect.Effect<ResolvedTeam, TeamResolutionError> =>
  context.team === null
    ? Effect.fail(new TeamResolutionError({ message: "No team. Pass --team, or run `rata link`." }))
    : Effect.succeed(context.team)

const requireTeamId = (
  context: ResolvedContext,
): Effect.Effect<TeamId, TeamNotFoundError | TeamResolutionError> => {
  if (context.team !== null) {
    return Effect.succeed(context.team.identity.id)
  }
  if (context.teamMissing) {
    const stored = context.storedTeam ?? "the linked team"
    return Effect.fail(
      new TeamNotFoundError({
        key: stored,
        message: isUuid(stored) ? `No team with id ${stored}.` : `No team with key ${stored}.`,
      }),
    )
  }
  return Effect.fail(
    new TeamResolutionError({ message: "No team. Pass --team, or run `rata link`." }),
  )
}

const resolveIssueId = (
  gateway: LinearGatewayShape,
  ref: IssueRef,
): Effect.Effect<IssueId, LinearApiError> =>
  isUuid(ref) ? Effect.succeed(issueId(ref)) : gateway.issue.id(ref)

const resolveIssueRef = (
  gateway: LinearGatewayShape,
  input: string,
): Effect.Effect<ResolvedIssueRef, LinearApiError | InvalidIssueRef> =>
  parseRefOrFail(input).pipe(
    Effect.flatMap((ref) => resolveIssueId(gateway, ref).pipe(Effect.map((id) => ({ ref, id })))),
  )

const resolveAssigneeId = (
  gateway: LinearGatewayShape,
  context: ResolvedContext,
  value: string,
): Effect.Effect<UserId, LinearApiError | AssigneeInputError | AssigneeNotFoundError> => {
  if (value.toLowerCase() === "me") {
    return context.viewer === null
      ? gateway.viewer.pipe(Effect.map((viewer) => viewer.id))
      : Effect.succeed(context.viewer.id)
  }
  if (!isUuid(value)) {
    return Effect.fail(
      new AssigneeInputError({ message: "The --assignee flag accepts `me` or a user UUID." }),
    )
  }
  return gateway.user.byId(userId(value)).pipe(
    Effect.filterOrFail(
      (found): found is UserId => found !== undefined,
      () =>
        new AssigneeNotFoundError({
          id: userId(value),
          message: `No user with id ${value}.`,
        }),
    ),
  )
}

const refreshContext = (
  resolver: ContextResolver["Service"],
  context: ResolvedContext,
): Effect.Effect<ResolvedContext, ContextResolveError> =>
  resolver.resolve({
    refresh: true,
    viewer: false,
    ...(context.team === null ? {} : { team: context.team.identity.key }),
  })

const missingState = (
  name: string,
  team: ResolvedTeam,
  states: readonly TeamState[],
): ContextStateNotFoundError => {
  const valid = states.map((state) => state.name)
  return new ContextStateNotFoundError({
    value: name,
    teamId: team.identity.id,
    valid,
    message: `No workflow state named ${name} in team ${team.identity.key}. ${validNameText("states", valid)}`,
  })
}

const missingLabel = (
  name: string,
  team: ResolvedTeam,
  labels: readonly TeamLabel[],
): ContextLabelNotFoundError => {
  const valid = labels.map((label) => label.name)
  return new ContextLabelNotFoundError({
    value: name,
    teamId: team.identity.id,
    valid,
    message: `No label named ${name} in team ${team.identity.key}. ${validNameText("labels", valid)}`,
  })
}

const resolveStateName = (
  resolver: ContextResolver["Service"],
  context: ResolvedContext,
  name: string,
): Effect.Effect<
  TeamState,
  ContextResolveError | ContextStateNotFoundError | TeamResolutionError
> =>
  Effect.gen(function* resolveState() {
    yield* requireTeam(context)
    const found = findStateByName(context.states, name)
    if (found !== undefined) {
      return found
    }
    const refreshed = yield* refreshContext(resolver, context)
    const freshTeam = yield* requireTeam(refreshed)
    const afterRefresh = findStateByName(refreshed.states, name)
    if (afterRefresh !== undefined) {
      return afterRefresh
    }
    return yield* missingState(name, freshTeam, refreshed.states)
  })

const resolveLabelName = (
  resolver: ContextResolver["Service"],
  context: ResolvedContext,
  name: string,
): Effect.Effect<
  TeamLabel,
  ContextResolveError | ContextLabelNotFoundError | TeamResolutionError
> =>
  Effect.gen(function* resolveLabel() {
    yield* requireTeam(context)
    const found = findLabelByName(context.labels, name)
    if (found !== undefined) {
      return found
    }
    const refreshed = yield* refreshContext(resolver, context)
    const freshTeam = yield* requireTeam(refreshed)
    const afterRefresh = findLabelByName(refreshed.labels, name)
    if (afterRefresh !== undefined) {
      return afterRefresh
    }
    return yield* missingLabel(name, freshTeam, refreshed.labels)
  })

const resolveLabels = (
  resolver: ContextResolver["Service"],
  context: ResolvedContext,
  names: readonly string[],
): Effect.Effect<
  readonly TeamLabel[],
  ContextResolveError | ContextLabelNotFoundError | TeamResolutionError
> => Effect.forEach(names, (name) => resolveLabelName(resolver, context, name))

export {
  requireTeamId,
  type ResolvedIssueRef,
  resolveAssigneeId,
  resolveIssueId,
  resolveIssueRef,
  resolveLabelName,
  resolveLabels,
  resolveStateName,
}
