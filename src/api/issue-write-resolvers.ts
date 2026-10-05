import { Effect } from "effect"

import type { LinearClient } from "@/api/client"
import type { WorkflowState } from "@/api/issue-schema"
import type { IssueRelationChanges, ResolvedRelationTarget } from "@/api/issue-write-model"
import type { LabelService } from "@/api/label"
import type { ProjectService } from "@/api/project"
import type { TeamService } from "@/api/team"

import {
  createCommentMutation,
  inverseRelationsQuery,
  issueIdQuery,
  issueStatesQuery,
  issueTeamQuery,
  pageSize,
  relationsQuery,
  teamStatesQuery,
  updateIssueMutation,
} from "@/api/issue-query"
import {
  CreateCommentResponse,
  InverseRelationsResponse,
  IssueIdResponse,
  IssueStatesResponse,
  IssueTeamResponse,
  RelationsResponse,
  TeamStatesResponse,
  UpdateIssueResponse,
} from "@/api/issue-schema"
import {
  LabelNotFoundError,
  parseRefOrFail,
  ProjectNotFoundError,
  StateNotFoundError,
  stateByName,
  stateByType,
  TeamResolutionError,
  unwrapComment,
  unwrapIssue,
} from "@/api/issue-write-model"
import { collectPages } from "@/api/pagination"
import { isUuid } from "@/domain/ref"

type IssueWriteDependencies = {
  readonly client: LinearClient["Service"]
  readonly teams: TeamService["Service"]
  readonly labels: LabelService["Service"]
  readonly projects: ProjectService["Service"]
}

const makeIssueWriteResolvers = ({ client, teams, labels, projects }: IssueWriteDependencies) => {
  const resolveIssueId = Effect.fn("IssueWriteApi.resolveIssueId")(function* resolveIssueId(
    input: string,
  ) {
    const ref = yield* parseRefOrFail(input)
    const data = yield* client.execute(issueIdQuery, { id: ref }, IssueIdResponse)
    return data.issue.id
  })

  const resolveAssignee = Effect.fn("IssueWriteApi.resolveAssignee")(function* resolveAssignee(
    value: string,
  ) {
    if (value.toLowerCase() === "me") {
      const viewer = yield* client.viewer
      return viewer.id
    }
    return value
  })

  const teamIdFor = Effect.fn("IssueWriteApi.teamIdFor")(function* teamIdFor(value: string) {
    if (isUuid(value)) {
      return value
    }
    const team = yield* teams.byKey(value)
    return team.id
  })

  const resolveTeamId = Effect.fn("IssueWriteApi.resolveTeamId")(function* resolveTeamId(
    flag: string | undefined,
    fallback: string | undefined,
  ) {
    const value = flag ?? fallback
    if (value === undefined) {
      return yield* new TeamResolutionError({
        message: "No team. Pass --team, or set the team in .rata.json.",
      })
    }
    return yield* teamIdFor(value)
  })

  const resolveProjectId = Effect.fn("IssueWriteApi.resolveProjectId")(function* resolveProjectId(
    value: string,
  ) {
    if (isUuid(value)) {
      return value
    }
    const all = yield* projects.list
    const match = all.find((project) => project.name.toLowerCase() === value.toLowerCase())
    if (match === undefined) {
      return yield* new ProjectNotFoundError({
        name: value,
        message: `No project named ${value}. Run \`rata project list\` to see the projects.`,
      })
    }
    return match.id
  })

  const stateIdByName = Effect.fn("IssueWriteApi.stateIdByName")(function* stateIdByName(
    states: readonly WorkflowState[],
    teamId: string,
    name: string,
  ) {
    const state = stateByName(states, name)
    if (state === undefined) {
      return yield* new StateNotFoundError({
        state: name,
        teamId,
        message: `No workflow state named ${name} in team ${teamId}.`,
      })
    }
    return state.id
  })

  const stateIdByType = Effect.fn("IssueWriteApi.stateIdByType")(function* stateIdByType(
    states: readonly WorkflowState[],
    teamId: string,
    type: string,
  ) {
    const state = stateByType(states, type)
    if (state === undefined) {
      return yield* new StateNotFoundError({
        state: type,
        teamId,
        message: `Team ${teamId} has no workflow state of type ${type}.`,
      })
    }
    return state.id
  })

  const teamStateIdByName = Effect.fn("IssueWriteApi.teamStateIdByName")(
    function* teamStateIdByName(teamId: string, name: string) {
      const data = yield* client.execute(teamStatesQuery, { teamId }, TeamStatesResponse)
      return yield* stateIdByName(data.team.states.nodes, teamId, name)
    },
  )

  const issueStateIdByName = Effect.fn("IssueWriteApi.issueStateIdByName")(
    function* issueStateIdByName(issueId: string, name: string) {
      const data = yield* client.execute(issueStatesQuery, { id: issueId }, IssueStatesResponse)
      const team = data.issue.team
      return yield* stateIdByName(team.states.nodes, team.id, name)
    },
  )

  const setStateByType = Effect.fn("IssueWriteApi.setStateByType")(function* setStateByType(
    issueId: string,
    type: string,
  ) {
    const states = yield* client.execute(issueStatesQuery, { id: issueId }, IssueStatesResponse)
    const team = states.issue.team
    const stateId = yield* stateIdByType(team.states.nodes, team.id, type)
    const data = yield* client.execute(
      updateIssueMutation,
      { id: issueId, input: { stateId } },
      UpdateIssueResponse,
    )
    return yield* unwrapIssue(data.issueUpdate)
  })

  const resolveLabelIds = Effect.fn("IssueWriteApi.resolveLabelIds")(function* resolveLabelIds(
    teamId: string,
    names: readonly string[],
  ) {
    const available = yield* labels.list(teamId)
    return yield* Effect.forEach(names, (name) => {
      const match = available.find((label) => label.name.toLowerCase() === name.toLowerCase())
      if (match === undefined) {
        return Effect.fail(
          new LabelNotFoundError({
            name,
            teamId,
            message: `No label named ${name} in team ${teamId}. Run \`rata label list --team <team key>\` to see the labels.`,
          }),
        )
      }
      return Effect.succeed(match.id)
    })
  })

  const postComment = Effect.fn("IssueWriteApi.postComment")(function* postComment(
    issueId: string,
    body: string,
  ) {
    const data = yield* client.execute(
      createCommentMutation,
      { input: { issueId, body } },
      CreateCommentResponse,
    )
    return yield* unwrapComment(data.commentCreate)
  })

  const resolveIssueTeamId = Effect.fn("IssueWriteApi.resolveIssueTeamId")(
    function* resolveIssueTeamId(issueId: string) {
      const data = yield* client.execute(issueTeamQuery, { id: issueId }, IssueTeamResponse)
      return data.issue.team.id
    },
  )

  const resolveRelationTargets = Effect.fn("IssueWriteApi.resolveRelationTargets")(
    function* resolveRelationTargets(changes: IssueRelationChanges) {
      const targets: ResolvedRelationTarget[] = []
      for (const target of changes.blocks) {
        const targetId = yield* resolveIssueId(target)
        targets.push({ kind: "blocks", target, targetId })
      }
      for (const target of changes.blockedBy) {
        const targetId = yield* resolveIssueId(target)
        targets.push({ kind: "blockedBy", target, targetId })
      }
      for (const target of changes.related) {
        const targetId = yield* resolveIssueId(target)
        targets.push({ kind: "related", target, targetId })
      }
      for (const target of changes.duplicate) {
        const targetId = yield* resolveIssueId(target)
        targets.push({ kind: "duplicate", target, targetId })
      }
      return targets
    },
  )

  const collectRelations = Effect.fn("IssueWriteApi.collectRelations")(function* collectRelations(
    issueId: string,
  ) {
    const outgoingPage = yield* client.execute(
      relationsQuery,
      { id: issueId, first: pageSize, after: null },
      RelationsResponse,
    )
    const outgoing = yield* collectPages(outgoingPage.issue.relations, (after) =>
      client
        .execute(relationsQuery, { id: issueId, first: pageSize, after }, RelationsResponse)
        .pipe(Effect.map((page) => page.issue.relations)),
    )
    const incomingPage = yield* client.execute(
      inverseRelationsQuery,
      { id: issueId, first: pageSize, after: null },
      InverseRelationsResponse,
    )
    const incoming = yield* collectPages(incomingPage.issue.inverseRelations, (after) =>
      client
        .execute(
          inverseRelationsQuery,
          { id: issueId, first: pageSize, after },
          InverseRelationsResponse,
        )
        .pipe(Effect.map((page) => page.issue.inverseRelations)),
    )
    return { incoming, outgoing }
  })

  return {
    collectRelations,
    issueStateIdByName,
    postComment,
    resolveAssignee,
    resolveIssueId,
    resolveIssueTeamId,
    resolveLabelIds,
    resolveProjectId,
    resolveRelationTargets,
    resolveTeamId,
    setStateByType,
    teamStateIdByName,
  }
}

export { makeIssueWriteResolvers, type IssueWriteDependencies }
