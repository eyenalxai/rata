import type { HttpClientRequest } from "effect/http"

import { ConfigProvider, Effect, FileSystem, Layer, Option, Path, Schema } from "effect"
import { HttpClient, HttpClientResponse } from "effect/http"

import { LinearClient } from "@/api/client"
import { LabelService } from "@/api/label"
import { ProjectService } from "@/api/project"
import { TeamService } from "@/api/team"
import { Auth } from "@/config/auth"

const GraphQLRequest = Schema.Struct({
  query: Schema.String,
  variables: Schema.Struct({
    key: Schema.optional(Schema.String),
    teamId: Schema.optional(Schema.String),
    input: Schema.optional(
      Schema.Struct({
        name: Schema.String,
        teamId: Schema.String,
      }),
    ),
  }),
})

type GraphQLRequest = typeof GraphQLRequest.Type

type Handler = (request: HttpClientRequest.HttpClientRequest) => Response

type FakeTeam = {
  readonly id: string
  readonly key: string
  readonly name: string
}

type FakeProject = {
  readonly id: string
  readonly name: string
  readonly status: { readonly name: string }
}

type FakeLabel = {
  readonly id: string
  readonly name: string
  readonly color: string
  readonly teamId: string
}

const jsonResponse = (body: unknown, status = 200): Response =>
  Response.json(body, { status, headers: { "content-type": "application/json" } })

const readRequest = (request: HttpClientRequest.HttpClientRequest): GraphQLRequest => {
  const body = request.body
  if (body._tag !== "Uint8Array") {
    throw new Error("Expected a byte-array request body.")
  }
  const parsed: unknown = JSON.parse(new TextDecoder().decode(body.body))
  const decoded = Schema.decodeUnknownOption(GraphQLRequest)(parsed)
  if (Option.isNone(decoded)) {
    throw new Error("Expected a GraphQL request body.")
  }
  return decoded.value
}

const makeFakeLinear = (
  seed: {
    readonly teams: readonly FakeTeam[]
    readonly projects: readonly FakeProject[]
    readonly labels: readonly FakeLabel[]
  },
  options: { readonly rejectCreate?: boolean } = {},
) => {
  const labels = [...seed.labels]
  const requests: GraphQLRequest[] = []
  const handler: Handler = (request) => {
    const graphql = readRequest(request)
    requests.push(graphql)
    const query = graphql.query
    if (query.includes("mutation CreateLabel")) {
      const input = graphql.variables.input
      if (input === undefined) {
        throw new Error("CreateLabel needs an input.")
      }
      if (options.rejectCreate === true) {
        return jsonResponse({
          data: {
            issueLabelCreate: {
              success: false,
              issueLabel: { id: "label-1", name: input.name, color: "#111111" },
            },
          },
        })
      }
      const created = {
        id: `label-${labels.length + 1}`,
        name: input.name,
        color: "#5E6AD2",
        teamId: input.teamId,
      }
      labels.push(created)
      return jsonResponse({
        data: {
          issueLabelCreate: {
            success: true,
            issueLabel: { id: created.id, name: created.name, color: created.color },
          },
        },
      })
    }
    if (query.includes("query TeamByKey")) {
      const key = graphql.variables.key
      return jsonResponse({
        data: { teams: { nodes: seed.teams.filter((item) => item.key === key) } },
      })
    }
    if (query.includes("query Teams")) {
      return jsonResponse({ data: { teams: { nodes: seed.teams } } })
    }
    if (query.includes("query Projects")) {
      return jsonResponse({ data: { projects: { nodes: seed.projects } } })
    }
    if (query.includes("query Labels")) {
      const teamId = graphql.variables.teamId
      return jsonResponse({
        data: {
          issueLabels: {
            nodes: labels
              .filter((label) => label.teamId === teamId)
              .map(({ id, name, color }) => ({ id, name, color })),
          },
        },
      })
    }
    return jsonResponse({ errors: [{ message: `Unexpected query: ${query}` }] }, 400)
  }
  return { handler, requests }
}

const configLayer = () =>
  ConfigProvider.layer(
    ConfigProvider.fromEnvRecord({ HOME: "/home/test", LINEAR_API_KEY: "test-key" }),
  )

const apiLayer = (handler: Handler) => {
  const http = HttpClient.make((request) =>
    Effect.succeed(HttpClientResponse.fromWeb(request, handler(request))),
  )
  const auth = Auth.layer.pipe(Layer.provide(Layer.mergeAll(FileSystem.layerNoop({}), Path.layer)))
  const client = LinearClient.layer.pipe(
    Layer.provide(Layer.mergeAll(auth, Layer.succeed(HttpClient.HttpClient, http))),
  )
  return Layer.mergeAll(
    configLayer(),
    client,
    TeamService.layer.pipe(Layer.provide(client)),
    LabelService.layer.pipe(Layer.provide(client)),
    ProjectService.layer.pipe(Layer.provide(client)),
  )
}

export { apiLayer, makeFakeLinear, type GraphQLRequest, type Handler }
