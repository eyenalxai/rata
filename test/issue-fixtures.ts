import type { RepositorySeed } from "@test/database-harness"
import type { HttpClientRequest } from "effect/http"

import { databaseLayer } from "@test/database-harness"
import { ConfigProvider, Effect, FileSystem, Layer, Path, Result, Schema } from "effect"
import { HttpClient, HttpClientResponse } from "effect/http"

import { LinearClient } from "@/api/client"
import { TeamService } from "@/api/team"
import { Auth } from "@/config/auth"
import { RepoConfigService } from "@/config/repo"
import { RepositoryIdentity } from "@/config/repo-identity"
import { ContextResolver } from "@/context/resolve"
import { attachmentId, issueId, labelId, projectId, userId } from "@/domain/id"
import { makeClient } from "@/linear/client"
import { LinearAuthError } from "@/linear/errors"
import { LinearGateway, makeLinearGateway } from "@/linear/gateway"
import { ContextCache } from "@/local/context-cache"
import { IssueReader } from "@/tracker/read"

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
const user = { id: userId("u1"), name: "Ada", displayName: "ada" }
const label = { id: labelId("l1"), name: "ready-for-agent" }
const project = { id: projectId("p1"), name: "Tracker" }
const parent = { id: issueId("i0"), identifier: "RAT-0", title: "Map" }

const teams = [
  { id: "team-1", key: "RAT", name: "Rata", timezone: "America/Los_Angeles" },
  { id: "team-2", key: "OPS", name: "Operations", timezone: "America/New_York" },
]

const summaryNode = (identifier: string) => ({
  id: issueId(`id-${identifier}`),
  identifier,
  title: `Title ${identifier}`,
  url: `https://linear.app/eyenalx/issue/${identifier}/title`,
  state,
  priority: 0,
  createdAt: "2026-01-01T08:00:00.000Z",
  updatedAt: "2026-01-01T09:00:00.000Z",
  assignee: user,
  project,
  parent,
  labels: { nodes: [label] },
})

const attachment = {
  id: attachmentId("a1"),
  title: "Design doc",
  subtitle: "Notion",
  url: "https://example.com/doc",
  sourceType: "link",
  createdAt: "2026-01-01T10:00:00.000Z",
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

const repositorySeed: readonly RepositorySeed[] = [
  { key: process.cwd(), team: "RAT", teamId: "team-1" },
]

const withTeamLookup =
  (handler: (request: HttpClientRequest.HttpClientRequest) => Response) =>
  (request: HttpClientRequest.HttpClientRequest): Response => {
    const body = readBody(request)
    if (body.query.includes("query Viewer")) {
      return jsonResponse({ data: { viewer } })
    }
    if (body.query.includes("query TeamByKey")) {
      const key = body.variables.key
      const nodes = typeof key === "string" ? teams.filter((team) => team.key === key) : []
      return jsonResponse({ data: { teams: { nodes, pageInfo } } })
    }
    if (body.query.includes("query TeamById")) {
      const id = body.variables.id
      const nodes = typeof id === "string" ? teams.filter((team) => team.id === id) : []
      return jsonResponse({ data: { teams: { nodes, pageInfo } } })
    }
    if (body.query.includes("query TeamByName")) {
      const name = body.variables.name
      const nodes =
        typeof name === "string"
          ? teams.filter((team) => team.name.toLowerCase() === name.toLowerCase())
          : []
      return jsonResponse({ data: { teams: { nodes, pageInfo } } })
    }
    if (body.query.includes("query TeamStates")) {
      return jsonResponse({ data: { team: { states: { nodes: [], pageInfo } } } })
    }
    if (body.query.includes("query TeamLabels")) {
      return jsonResponse({ data: { issueLabels: { nodes: [], pageInfo } } })
    }
    if (body.query.includes("query TeamMembers")) {
      return jsonResponse({ data: { team: { members: { nodes: [], pageInfo } } } })
    }
    if (body.query.includes("query IssuePriorityValues")) {
      return jsonResponse({ data: { issuePriorityValues: [] } })
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
  const gateway = Layer.effect(
    LinearGateway,
    Effect.gen(function* linearGatewayLayer() {
      const resolvedAuth = yield* Auth
      const key = () =>
        resolvedAuth.require.pipe(
          Effect.map((resolved) => resolved.key),
          Effect.mapError((error) => new LinearAuthError({ message: error.message, cause: error })),
        )
      return LinearGateway.of(makeLinearGateway(makeClient(http, key)))
    }),
  ).pipe(Layer.provide(Layer.mergeAll(auth, Layer.succeed(HttpClient.HttpClient, http))))
  const client = LinearClient.layer.pipe(Layer.provide(gateway))
  const teamLayer = TeamService.layer.pipe(Layer.provide(Layer.mergeAll(gateway, client)))
  const contextCache = ContextCache.layer.pipe(Layer.provide(database))
  const contextResolver = ContextResolver.layer.pipe(
    Layer.provide(Layer.mergeAll(auth, gateway, teamLayer, repoConfig, identity, contextCache)),
  )
  const reader = IssueReader.layer.pipe(Layer.provide(Layer.mergeAll(gateway, contextResolver)))
  return Layer.mergeAll(contextResolver, reader)
}

const run = <A, E>(
  handler: (request: HttpClientRequest.HttpClientRequest) => Response,
  effect: Effect.Effect<A, E, ContextResolver | IssueReader>,
  repositories: readonly RepositorySeed[] = repositorySeed,
): Promise<A> =>
  effect.pipe(
    Effect.provide(
      Layer.mergeAll(issueLayer(withTeamLookup(handler), repositories), configLayer()),
    ),
    Effect.runPromise,
  )

const summaryKeys = [
  "assignee",
  "createdAt",
  "id",
  "identifier",
  "labels",
  "parent",
  "priority",
  "project",
  "state",
  "title",
  "updatedAt",
  "url",
] as const

export {
  attachment,
  jsonResponse,
  pageInfo,
  readBody,
  run,
  type RequestBody,
  summaryKeys,
  summaryNode,
  user,
  uuid,
  viewer,
  withTeamLookup,
}
