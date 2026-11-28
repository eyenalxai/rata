import type {
  FakeLabel,
  FakePriority,
  FakeTeam,
  FakeTeamMember,
  GraphQLRequest,
  Handler,
} from "@test/fake-linear/model"
import type { HttpClientRequest } from "effect/http"

import { defaultPriorities, readRequest } from "@test/fake-linear/model"
import { jsonResponse, pageInfo, summaryNode } from "@test/issue-fixtures"

const team = { id: "00000000-0000-0000-0000-000000000001", key: "RAT", name: "Rata", timezone: "America/Los_Angeles" }

const states = [
  { id: "s-backlog", name: "Backlog", type: "backlog" },
  { id: "s-todo", name: "Todo", type: "unstarted" },
  { id: "s-progress", name: "In Progress", type: "started" },
  { id: "s-done", name: "Done", type: "completed" },
]

type TeamDetailSeed = {
  readonly team?: FakeTeam | undefined
  readonly states?:
    | readonly {
        readonly id: string
        readonly name: string
        readonly type: string
        readonly position?: number | undefined
      }[]
    | undefined
  readonly labels?: readonly FakeLabel[] | undefined
  readonly members?: readonly FakeTeamMember[] | undefined
  readonly priorities?: readonly FakePriority[] | undefined
}

const teamDetailResponse = (
  request: GraphQLRequest,
  seed: TeamDetailSeed = {},
): Response | undefined => {
  const selectedTeam = seed.team ?? team
  if (
    request.query.includes("query TeamById") ||
    request.query.includes("query TeamByKey") ||
    request.query.includes("query TeamByName")
  ) {
    return jsonResponse({ data: { teams: { nodes: [selectedTeam], pageInfo } } })
  }
  if (request.query.includes("query TeamStates")) {
    const nodes = (seed.states ?? states).map((state, index) => ({
      ...state,
      position: "position" in state ? (state.position ?? index) : index,
    }))
    return jsonResponse({ data: { team: { states: { nodes, pageInfo } } } })
  }
  if (request.query.includes("query TeamLabels")) {
    const nodes = (seed.labels ?? []).map((label) => ({
      id: label.id,
      name: label.name,
      color: label.color,
      team: label.teamId === null ? null : { id: label.teamId },
    }))
    return jsonResponse({ data: { issueLabels: { nodes, pageInfo } } })
  }
  if (request.query.includes("query TeamMembers")) {
    return jsonResponse({
      data: { team: { members: { nodes: seed.members ?? [], pageInfo } } },
    })
  }
  if (request.query.includes("query IssuePriorityValues")) {
    return jsonResponse({ data: { issuePriorityValues: seed.priorities ?? defaultPriorities } })
  }
  return undefined
}

const issueCreated = (): Response =>
  jsonResponse({ data: { issueCreate: { success: true, issue: summaryNode("RAT-1") } } })

type Recorder = {
  readonly handler: Handler
  readonly requests: GraphQLRequest[]
}

const makeRecorder = (respond: (request: GraphQLRequest) => Response): Recorder => {
  const requests: GraphQLRequest[] = []
  const handler: Handler = (httpRequest: HttpClientRequest.HttpClientRequest) => {
    const request = readRequest(httpRequest)
    requests.push(request)
    if (request.query.includes("query IssueTeam")) {
      return jsonResponse({ data: { issue: { team: { id: "00000000-0000-0000-0000-000000000001" } } } })
    }
    return respond(request)
  }
  return { handler, requests }
}

const requestOf = (recorder: Recorder, fragment: string): GraphQLRequest | undefined =>
  recorder.requests.find((request) => request.query.includes(fragment))

export { issueCreated, makeRecorder, requestOf, type Recorder, team, teamDetailResponse }
