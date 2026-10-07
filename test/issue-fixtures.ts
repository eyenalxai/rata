import type { RepositorySeed } from "@test/database-harness"
import type { HttpClientRequest } from "effect/http"

import { databaseLayer } from "@test/database-harness"
import { ConfigProvider, Effect, FileSystem, Layer, Path, Result, Schema } from "effect"
import { HttpClient, HttpClientResponse } from "effect/http"

import { LinearClient } from "@/api/client"
import { IssueApi } from "@/api/issue"
import { RepoTeam } from "@/api/repo-team"
import { TeamService } from "@/api/team"
import { Auth } from "@/config/auth"
import { RepoConfigService } from "@/config/repo"
import { RepositoryIdentity } from "@/config/repo-identity"

const uuid = "5f0c1f2a-3b4c-4d5e-8f90-1234567890ab"

const viewer = {
  id: "u1",
  name: "Ada",
  displayName: "ada",
  email: "ada@example.com",
  active: true,
  admin: false,
  organization: { id: "o1", name: "Rata", urlKey: "rata" },
}

const pageInfo = { hasNextPage: false, endCursor: null }

const state = { name: "In Progress", type: "started" }
const user = { id: "u1", name: "Ada", displayName: "ada" }
const label = { id: "l1", name: "ready-for-agent" }
const project = { id: "p1", name: "Tracker" }
const parent = { id: "i0", identifier: "RAT-0", title: "Map" }

const teams = [
  { id: "team-1", key: "RAT", name: "Rata", timezone: "America/Los_Angeles" },
  { id: "team-2", key: "OPS", name: "Operations", timezone: "America/New_York" },
]

const summaryNode = (identifier: string) => ({
  id: `id-${identifier}`,
  identifier,
  title: `Title ${identifier}`,
  url: `https://linear.app/eyenalx/issue/${identifier}/title`,
  state,
  priority: 0,
  assignee: user,
  project,
  parent,
  labels: { nodes: [label] },
})

const child = {
  id: "i2",
  identifier: "RAT-2",
  title: "Child",
  state: { name: "Todo", type: "unstarted" },
}

const baseDetail = {
  id: "i1",
  identifier: "RAT-1",
  title: "The issue",
  description: "Body",
  url: "https://linear.app/eyenalx/issue/RAT-1/the-issue",
  state,
  priority: 0,
  assignee: user,
  project,
  parent,
  team: { id: "t1", key: "RAT", name: "Rata" },
  labels: { nodes: [label], pageInfo },
  children: { nodes: [child], pageInfo },
  relations: { nodes: [], pageInfo },
  inverseRelations: { nodes: [], pageInfo },
}

const RequestBody = Schema.Struct({
  query: Schema.String,
  variables: Schema.Record(Schema.String, Schema.Unknown),
})
type RequestBody = typeof RequestBody.Type

const jsonResponse = (body: unknown, status = 200): Response =>
  Response.json(body, {
    status,
    headers: { "content-type": "application/json" },
  })

const readBody = (request: HttpClientRequest.HttpClientRequest): RequestBody => {
  const body = request.body
  if (body._tag !== "Uint8Array" || body.text === undefined) {
    throw new Error("Expected a JSON request body.")
  }
  const decoded = Schema.decodeResult(Schema.fromJsonString(RequestBody))(body.text)
  if (Result.isFailure(decoded)) {
    throw new Error("Expected a JSON request body.")
  }
  return decoded.success
}

const configLayer = () =>
  ConfigProvider.layer(
    ConfigProvider.fromEnvRecord({ HOME: "/home/test", LINEAR_API_KEY: "test-key" }),
  )

const repositorySeed: readonly RepositorySeed[] = [{ key: process.cwd(), team: "RAT" }]

const withTeamLookup =
  (handler: (request: HttpClientRequest.HttpClientRequest) => Response) =>
  (request: HttpClientRequest.HttpClientRequest): Response => {
    const body = readBody(request)
    if (body.query.includes("query TeamByKey")) {
      const key = body.variables.key
      const nodes = typeof key === "string" ? teams.filter((team) => team.key === key) : []
      return jsonResponse({ data: { teams: { nodes, pageInfo } } })
    }
    return handler(request)
  }

const issueLayer = (
  handler: (request: HttpClientRequest.HttpClientRequest) => Response,
  repositories: readonly RepositorySeed[],
) => {
  const http = HttpClient.make((request) =>
    Effect.succeed(HttpClientResponse.fromWeb(request, handler(request))),
  )
  const platform = Layer.mergeAll(FileSystem.layerNoop({}), Path.layer)
  const database = databaseLayer(repositories)
  const identity = RepositoryIdentity.layer.pipe(Layer.provide(platform))
  const repoConfig = RepoConfigService.layer.pipe(
    Layer.provide(Layer.mergeAll(platform, database, identity)),
  )
  const auth = Auth.layer.pipe(Layer.provide(Layer.mergeAll(repoConfig, platform, database)))
  const client = LinearClient.layer.pipe(
    Layer.provide(Layer.mergeAll(auth, Layer.succeed(HttpClient.HttpClient, http))),
  )
  const teamLayer = TeamService.layer.pipe(Layer.provide(client))
  const repoTeam = RepoTeam.layer.pipe(Layer.provide(Layer.mergeAll(teamLayer, repoConfig)))
  return IssueApi.layer.pipe(Layer.provide(Layer.mergeAll(client, repoTeam)))
}

const run = <A, E>(
  handler: (request: HttpClientRequest.HttpClientRequest) => Response,
  effect: Effect.Effect<A, E, IssueApi>,
  repositories: readonly RepositorySeed[] = repositorySeed,
): Promise<A> =>
  effect.pipe(
    Effect.provide(
      Layer.mergeAll(issueLayer(withTeamLookup(handler), repositories), configLayer()),
    ),
    Effect.runPromise,
  )

export { baseDetail, jsonResponse, pageInfo, readBody, run, summaryNode, user, uuid, viewer }
