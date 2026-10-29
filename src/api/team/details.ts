import { Effect, Schema } from "effect"

import type { LinearClient } from "@/api/client"

import { collectConnection, PageInfo, pageSize } from "@/api/pagination"

type TeamIdentity = {
  readonly id: string
  readonly key: string
  readonly name: string
  readonly timezone: string
}

const TeamState = Schema.Struct({
  id: Schema.String,
  name: Schema.String,
  type: Schema.String,
  position: Schema.Finite,
})

type TeamState = typeof TeamState.Type

const TeamLabel = Schema.Struct({
  id: Schema.String,
  name: Schema.String,
  color: Schema.String,
  scope: Schema.Literals(["team", "workspace"]),
})

type TeamLabel = typeof TeamLabel.Type

const TeamMember = Schema.Struct({
  id: Schema.String,
  name: Schema.String,
  displayName: Schema.String,
  email: Schema.String,
})

type TeamMember = typeof TeamMember.Type

const TeamPriority = Schema.Struct({
  priority: Schema.Int,
  label: Schema.String,
})

type TeamPriority = typeof TeamPriority.Type

const TeamDetail = Schema.Struct({
  id: Schema.String,
  key: Schema.String,
  name: Schema.String,
  timezone: Schema.String,
  states: Schema.Array(TeamState),
  labels: Schema.Array(TeamLabel),
  members: Schema.Array(TeamMember),
  priorities: Schema.Array(TeamPriority),
})

type TeamDetail = typeof TeamDetail.Type

const TeamStateConnection = Schema.Struct({
  nodes: Schema.Array(TeamState),
  pageInfo: PageInfo,
})

const TeamLabelNode = Schema.Struct({
  id: Schema.String,
  name: Schema.String,
  color: Schema.String,
  team: Schema.NullOr(Schema.Struct({ id: Schema.String })),
})

const TeamLabelConnection = Schema.Struct({
  nodes: Schema.Array(TeamLabelNode),
  pageInfo: PageInfo,
})

const TeamMemberNode = Schema.Struct({
  id: Schema.String,
  name: Schema.String,
  displayName: Schema.String,
  email: Schema.String,
  active: Schema.Boolean,
})

const TeamMemberConnection = Schema.Struct({
  nodes: Schema.Array(TeamMemberNode),
  pageInfo: PageInfo,
})

const teamStatesQuery = `query TeamStates($teamId: String!, $first: Int!, $after: String) {
  team(id: $teamId) {
    states(first: $first, after: $after) {
      nodes { id name type position }
      pageInfo { hasNextPage endCursor }
    }
  }
}`

const teamMembersQuery = `query TeamMembers($teamId: String!, $first: Int!, $after: String) {
  team(id: $teamId) {
    members(first: $first, after: $after) {
      nodes { id name displayName email active }
      pageInfo { hasNextPage endCursor }
    }
  }
}`

const teamLabelsQuery = `query TeamLabels($teamId: ID!, $first: Int!, $after: String) {
  issueLabels(first: $first, after: $after, orderBy: createdAt, filter: { or: [{ team: { id: { eq: $teamId } } }, { team: { null: true } }] }) {
    nodes { id name color team { id } }
    pageInfo { hasNextPage endCursor }
  }
}`

const issuePriorityValuesQuery = `query IssuePriorityValues {
  issuePriorityValues { priority label }
}`

const fetchTeamDetail = Effect.fn("TeamDetail.fetch")(function* fetchTeamDetail(
  execute: LinearClient["Service"]["execute"],
  team: TeamIdentity,
) {
  const states = yield* collectConnection((after) =>
    execute(
      teamStatesQuery,
      { teamId: team.id, first: pageSize, after },
      Schema.Struct({ team: Schema.Struct({ states: TeamStateConnection }) }),
    ).pipe(Effect.map((data) => data.team.states)),
  )
  const labels = yield* collectConnection((after) =>
    execute(
      teamLabelsQuery,
      { teamId: team.id, first: pageSize, after },
      Schema.Struct({ issueLabels: TeamLabelConnection }),
    ).pipe(Effect.map((data) => data.issueLabels)),
  )
  const members = yield* collectConnection((after) =>
    execute(
      teamMembersQuery,
      { teamId: team.id, first: pageSize, after },
      Schema.Struct({ team: Schema.Struct({ members: TeamMemberConnection }) }),
    ).pipe(Effect.map((data) => data.team.members)),
  )
  const priorityData = yield* execute(
    issuePriorityValuesQuery,
    {},
    Schema.Struct({ issuePriorityValues: Schema.Array(TeamPriority) }),
  )
  return {
    ...team,
    states: states.toSorted((left, right) => left.position - right.position),
    labels: labels.map((label): TeamLabel => ({
      id: label.id,
      name: label.name,
      color: label.color,
      scope: label.team === null ? "workspace" : "team",
    })),
    members: members
      .filter((member) => member.active)
      .map((member): TeamMember => ({
        id: member.id,
        name: member.name,
        displayName: member.displayName,
        email: member.email,
      })),
    priorities: priorityData.issuePriorityValues.toSorted(
      (left, right) => left.priority - right.priority,
    ),
  } satisfies TeamDetail
})

export { fetchTeamDetail, type TeamDetail }
