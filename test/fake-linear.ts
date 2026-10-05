import type { HttpClientRequest } from "effect/http"

import { ConfigProvider, Effect, FileSystem, Layer, Option, Path, Schema, Stdio } from "effect"
import { HttpClient, HttpClientResponse } from "effect/http"

import { LinearClient } from "@/api/client"
import { IssueWriteApi } from "@/api/issue-write"
import { LabelService } from "@/api/label"
import { ProjectService } from "@/api/project"
import { TeamService } from "@/api/team"
import { Auth } from "@/config/auth"
import { InitService } from "@/config/init"
import { RepoConfigService } from "@/config/repo"

const GraphQLRequest = Schema.Struct({
  query: Schema.String,
  variables: Schema.Record(Schema.String, Schema.Unknown),
})

type GraphQLRequest = typeof GraphQLRequest.Type

type Handler = (request: HttpClientRequest.HttpClientRequest) => Response

type FakeTeam = {
  readonly id: string
  readonly key: string
  readonly name: string
}

type FakeLabel = {
  readonly id: string
  readonly name: string
  readonly color: string
  readonly teamId: string | null
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

const recordSchema = Schema.Record(Schema.String, Schema.Unknown)

const inputOf = (variables: Record<string, unknown>): Record<string, unknown> => {
  const decoded = Schema.decodeUnknownOption(recordSchema)(variables.input)
  return Option.isSome(decoded) ? decoded.value : {}
}

const stringField = (record: Record<string, unknown>, name: string): string => {
  const value = record[name]
  if (typeof value !== "string") {
    throw new TypeError(`Expected a string field ${name}.`)
  }
  return value
}

const makeFakeLinear = (
  seed: {
    readonly teams: readonly FakeTeam[]
    readonly labels: readonly FakeLabel[]
  },
  options: {
    readonly rejectCreate?: boolean
    readonly rejectTeamCreate?: boolean
    readonly rejectTeamDelete?: boolean
  } = {},
) => {
  const labels = [...seed.labels]
  const teams = [...seed.teams]
  const requests: GraphQLRequest[] = []
  const handler: Handler = (request) => {
    const graphql = readRequest(request)
    requests.push(graphql)
    const query = graphql.query
    if (query.includes("mutation TeamCreate")) {
      const input = inputOf(graphql.variables)
      const name = stringField(input, "name")
      if (options.rejectTeamCreate === true) {
        return jsonResponse({ data: { teamCreate: { success: false, team: null } } })
      }
      const created = {
        id: `team-${teams.length + 1}`,
        key: typeof input.key === "string" ? input.key : "AUTO",
        name,
      }
      teams.push(created)
      return jsonResponse({ data: { teamCreate: { success: true, team: created } } })
    }
    if (query.includes("mutation CreateLabel")) {
      const input = inputOf(graphql.variables)
      const name = stringField(input, "name")
      if (options.rejectCreate === true) {
        return jsonResponse({
          data: {
            issueLabelCreate: {
              success: false,
              issueLabel: { id: "label-1", name, color: "#111111" },
            },
          },
        })
      }
      const created = {
        id: `label-${labels.length + 1}`,
        name,
        color: "#5E6AD2",
        teamId: stringField(input, "teamId"),
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
    if (query.includes("mutation TeamDelete")) {
      const id = stringField(graphql.variables, "id")
      if (options.rejectTeamDelete === true) {
        return jsonResponse({ data: { teamDelete: { success: false, entityId: id } } })
      }
      const index = teams.findIndex((item) => item.id === id)
      if (index === -1) {
        return jsonResponse({ data: { teamDelete: { success: false, entityId: id } } })
      }
      teams.splice(index, 1)
      return jsonResponse({ data: { teamDelete: { success: true, entityId: id } } })
    }
    if (query.includes("query TeamById")) {
      const id = graphql.variables.id
      return jsonResponse({
        data: { teams: { nodes: teams.filter((item) => item.id === id) } },
      })
    }
    if (query.includes("query TeamByKey")) {
      const key = graphql.variables.key
      return jsonResponse({
        data: { teams: { nodes: teams.filter((item) => item.key === key) } },
      })
    }
    if (query.includes("query Teams")) {
      return jsonResponse({ data: { teams: { nodes: teams } } })
    }
    if (query.includes("query AvailableLabels")) {
      const teamId = graphql.variables.teamId
      return jsonResponse({
        data: {
          issueLabels: {
            nodes: labels
              .filter((label) => label.teamId === teamId || label.teamId === null)
              .map(({ id, name, color }) => ({ id, name, color })),
          },
        },
      })
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

type ApiLayerOptions = {
  readonly files?: Map<string, string>
  readonly stdio?: Partial<Stdio.Stdio>
}

const apiLayer = (handler: Handler, options: ApiLayerOptions = {}) => {
  const http = HttpClient.make((request) =>
    Effect.succeed(HttpClientResponse.fromWeb(request, handler(request))),
  )
  const files = options.files ?? new Map<string, string>()
  const fs = FileSystem.layerNoop({
    exists: (file) => Effect.succeed(files.has(file)),
    readFileString: (file) => Effect.succeed(files.get(file) ?? ""),
    writeFileString: (file, data) => {
      files.set(file, data)
      return Effect.void
    },
    makeDirectory: () => Effect.void,
  })
  const platform = Layer.mergeAll(fs, Path.layer, Stdio.layerTest(options.stdio ?? {}))
  const auth = Auth.layer.pipe(Layer.provide(platform))
  const client = LinearClient.layer.pipe(
    Layer.provide(Layer.mergeAll(auth, Layer.succeed(HttpClient.HttpClient, http))),
  )
  const teams = TeamService.layer.pipe(Layer.provide(client))
  const labels = LabelService.layer.pipe(Layer.provide(client))
  const projects = ProjectService.layer.pipe(Layer.provide(client))
  const repoConfig = RepoConfigService.layer.pipe(Layer.provide(platform))
  const issueWrite = IssueWriteApi.layer.pipe(
    Layer.provide(Layer.mergeAll(client, teams, labels, projects, repoConfig)),
  )
  const init = InitService.layer.pipe(
    Layer.provide(Layer.mergeAll(teams, labels, repoConfig, platform)),
  )
  return Layer.mergeAll(
    configLayer(),
    client,
    teams,
    labels,
    projects,
    repoConfig,
    issueWrite,
    init,
  )
}

export {
  apiLayer,
  type ApiLayerOptions,
  type GraphQLRequest,
  type Handler,
  inputOf,
  makeFakeLinear,
  readRequest,
}
