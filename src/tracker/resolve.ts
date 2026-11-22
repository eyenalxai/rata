import { Effect } from "effect"

import type { ResolvedContext } from "@/context/model"
import type { ContextResolveError, ContextResolver } from "@/context/resolve"
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

type ContextTeamId = Pick<ResolvedContext, "storedTeam" | "storedTeamId" | "team">

type AssigneeContext = {
  readonly viewer: { readonly id: UserId }
}

type ResolvedIssueRef = {
  readonly ref: IssueRef
  readonly id: IssueId
}

const requireTeamId = (
  context: ContextTeamId,
): Effect.Effect<TeamId, TeamNotFoundError | TeamResolutionError> => {
  if (context.team !== null) {
    return Effect.succeed(context.team.identity.id)
  }
  if (context.storedTeamId !== null) {
    return Effect.succeed(context.storedTeamId)
  }
  if (context.storedTeam !== null) {
    return Effect.fail(
      new TeamNotFoundError({
        key: context.storedTeam,
        message: `No team with key ${context.storedTeam}.`,
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
  context: AssigneeContext,
  value: string,
): Effect.Effect<UserId, LinearApiError | AssigneeInputError | AssigneeNotFoundError> => {
  if (value.toLowerCase() === "me") {
    return Effect.succeed(context.viewer.id)
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

const missingState = (
  name: string,
  teamKey: string,
  teamId: TeamId,
  states: readonly TeamState[],
): ContextStateNotFoundError => {
  const valid = states.map((state) => state.name)
  return new ContextStateNotFoundError({
    value: name,
    teamId,
    valid,
    message: `No workflow state named ${name} in team ${teamKey}. ${validNameText("states", valid)}`,
  })
}

const missingLabel = (
  name: string,
  teamKey: string,
  teamId: TeamId,
  labels: readonly TeamLabel[],
): ContextLabelNotFoundError => {
  const valid = labels.map((label) => label.name)
  return new ContextLabelNotFoundError({
    value: name,
    teamId,
    valid,
    message: `No label named ${name} in team ${teamKey}. ${validNameText("labels", valid)}`,
  })
}

const resolveStateName = (
  resolver: ContextResolver["Service"],
  teamId: TeamId,
  name: string,
): Effect.Effect<TeamState, ContextResolveError | ContextStateNotFoundError> =>
  Effect.gen(function* resolveState() {
    const first = yield* resolver.teamDetail(teamId, false)
    const found = findStateByName(first.detail.states, name)
    if (found !== undefined) {
      return found
    }
    const refreshed = yield* resolver.teamDetail(teamId, true)
    const afterRefresh = findStateByName(refreshed.detail.states, name)
    if (afterRefresh !== undefined) {
      return afterRefresh
    }
    return yield* missingState(
      name,
      refreshed.detail.key,
      refreshed.detail.id,
      refreshed.detail.states,
    )
  })

const resolveLabelName = (
  resolver: ContextResolver["Service"],
  teamId: TeamId,
  name: string,
): Effect.Effect<TeamLabel, ContextResolveError | ContextLabelNotFoundError> =>
  Effect.gen(function* resolveLabel() {
    const first = yield* resolver.teamDetail(teamId, false)
    const found = findLabelByName(first.detail.labels, name)
    if (found !== undefined) {
      return found
    }
    const refreshed = yield* resolver.teamDetail(teamId, true)
    const afterRefresh = findLabelByName(refreshed.detail.labels, name)
    if (afterRefresh !== undefined) {
      return afterRefresh
    }
    return yield* missingLabel(
      name,
      refreshed.detail.key,
      refreshed.detail.id,
      refreshed.detail.labels,
    )
  })

const resolveLabels = (
  resolver: ContextResolver["Service"],
  teamId: TeamId,
  names: readonly string[],
): Effect.Effect<readonly TeamLabel[], ContextResolveError | ContextLabelNotFoundError> =>
  Effect.forEach(names, (name) => resolveLabelName(resolver, teamId, name))

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
