import type { GraphQLRequest, Handler } from "@test/fake-linear"
import type { HttpClientRequest } from "effect/http"

import { apiLayer, readRequest } from "@test/fake-linear"
import { jsonResponse, summaryNode } from "@test/issue-fixtures"
import { Effect } from "effect"

import type { IssueWriteApi } from "@/api/issue-write"

const team = { id: "team-1", key: "RAT", name: "Rata", timezone: "America/Los_Angeles" }
const otherTeam = { id: "team-2", key: "OPS", name: "Operations", timezone: "America/Los_Angeles" }

const states = [
  { id: "s-backlog", name: "Backlog", type: "backlog" },
  { id: "s-todo", name: "Todo", type: "unstarted" },
  { id: "s-progress", name: "In Progress", type: "started" },
  { id: "s-done", name: "Done", type: "completed" },
]

const issueCreated = (): Response =>
  jsonResponse({ data: { issueCreate: { success: true, issue: summaryNode("RAT-1") } } })

const issueUpdated = (): Response =>
  jsonResponse({ data: { issueUpdate: { success: true, issue: summaryNode("RAT-1") } } })

type Recorder = {
  readonly handler: Handler
  readonly requests: GraphQLRequest[]
}

const makeRecorder = (respond: (request: GraphQLRequest) => Response): Recorder => {
  const requests: GraphQLRequest[] = []
  const handler: Handler = (httpRequest: HttpClientRequest.HttpClientRequest) => {
    const request = readRequest(httpRequest)
    requests.push(request)
    return respond(request)
  }
  return { handler, requests }
}

const run = <A, E>(
  handler: Handler,
  effect: Effect.Effect<A, E, IssueWriteApi>,
  files: Map<string, string> = new Map<string, string>(),
): Promise<A> => effect.pipe(Effect.provide(apiLayer(handler, { files })), Effect.runPromise)

const configWithTeam = (key: string) =>
  new Map([[`${process.cwd()}/.rata.json`, JSON.stringify({ team: key })]])

const requestOf = (recorder: Recorder, fragment: string): GraphQLRequest | undefined =>
  recorder.requests.find((request) => request.query.includes(fragment))

export {
  configWithTeam,
  issueCreated,
  issueUpdated,
  makeRecorder,
  otherTeam,
  requestOf,
  type Recorder,
  run,
  states,
  team,
}
