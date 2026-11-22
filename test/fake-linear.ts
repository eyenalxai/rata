import type { CacheSeed, ProfileSeed, RepositorySeed } from "@test/database-harness"
import type {
  FakeLabel,
  FakePriority,
  FakeProject,
  FakeTeam,
  FakeViewer,
  FakeWorkspace,
  GraphQLRequest,
  Handler,
} from "@test/fake-linear/model"
import type { FakeState } from "@test/fake-linear/mutation"

import { databaseLayer } from "@test/database-harness"
import {
  defaultEnv,
  defaultPriorities,
  defaultViewer,
  jsonResponse,
  paginate,
  readRequest,
} from "@test/fake-linear/model"
import { handleMutation } from "@test/fake-linear/mutation"
import { handleProjectQuery } from "@test/fake-linear/project"
import { ConfigProvider, Effect, FileSystem, Layer, Path, Stdio } from "effect"
import { HttpClient, HttpClientResponse } from "effect/http"

import { LinearClient } from "@/api/client"
import { IssueWriteApi } from "@/api/issue-write"
import { LabelService } from "@/api/label"
import { ProjectService } from "@/api/project"
import { RepoTeam } from "@/api/repo-team"
import { TeamService } from "@/api/team"
import { Auth } from "@/config/auth"
import { IssueDefaultsService } from "@/config/defaults"
import { LinkService } from "@/config/link"
import { RepoConfigService } from "@/config/repo"
import { RepositoryIdentity } from "@/config/repo-identity"
import { ContextResolver } from "@/context/resolve"
import { TeamContext } from "@/context/team"
import { makeClient } from "@/linear/client"
import { LinearAuthError } from "@/linear/errors"
import { LinearGateway, makeLinearGateway } from "@/linear/gateway"
import { ContextCache } from "@/local/context-cache"
import { IssueReader } from "@/tracker/read"
import { IssueWriter } from "@/tracker/write"

const handleQuery = (
  graphql: GraphQLRequest,
  state: FakeState,
  viewer: FakeViewer,
): Response | undefined => {
  const query = graphql.query
  if (query.includes("query Viewer")) {
    return jsonResponse({ data: { viewer } })
  }
  if (query.includes("query TeamById")) {
    const id = graphql.variables.id
    return jsonResponse({
      data: {
        teams: paginate(
          state.teams.filter((item) => item.id === id),
          graphql.variables,
        ),
      },
    })
  }
  if (query.includes("query TeamByKey")) {
    const key = graphql.variables.key
    return jsonResponse({
      data: {
        teams: paginate(
          state.teams.filter((item) => item.key === key),
          graphql.variables,
        ),
      },
    })
  }
  if (query.includes("query TeamByName")) {
    const name = graphql.variables.name
    return jsonResponse({
      data: {
        teams: paginate(
          state.teams.filter(
            (item) => typeof name === "string" && item.name.toLowerCase() === name.toLowerCase(),
          ),
          graphql.variables,
        ),
      },
    })
  }
  if (query.includes("query Teams")) {
    return jsonResponse({ data: { teams: paginate(state.teams, graphql.variables) } })
  }
  if (query.includes("query TeamStates")) {
    const team = state.teams.find((item) => item.id === graphql.variables.teamId)
    return jsonResponse({
      data: { team: { states: paginate(team?.states ?? [], graphql.variables) } },
    })
  }
  if (query.includes("query TeamMembers")) {
    const team = state.teams.find((item) => item.id === graphql.variables.teamId)
    return jsonResponse({
      data: { team: { members: paginate(team?.members ?? [], graphql.variables) } },
    })
  }
  if (query.includes("query TeamLabels")) {
    const teamId = graphql.variables.teamId
    const labels = state.labels
      .filter((label) => label.teamId === teamId || label.teamId === null)
      .map((label) => ({
        id: label.id,
        name: label.name,
        color: label.color,
        team: label.teamId === null ? null : { id: label.teamId },
      }))
    return jsonResponse({ data: { issueLabels: paginate(labels, graphql.variables) } })
  }
  if (query.includes("query IssuePriorityValues")) {
    return jsonResponse({ data: { issuePriorityValues: state.priorities } })
  }
  if (query.includes("query UserById")) {
    const id = graphql.variables.id
    const users = id === defaultViewer.id ? [{ id: defaultViewer.id }] : []
    return jsonResponse({ data: { users: { nodes: users } } })
  }
  if (query.includes("query AvailableLabels")) {
    const teamId = graphql.variables.teamId
    const available = state.labels
      .filter((label) => label.teamId === teamId || label.teamId === null)
      .map(({ id, name, color }) => ({ id, name, color }))
    return jsonResponse({ data: { issueLabels: paginate(available, graphql.variables) } })
  }
  if (query.includes("query Labels")) {
    const teamId = graphql.variables.teamId
    const teamLabels = state.labels
      .filter((label) => label.teamId === teamId)
      .map(({ id, name, color }) => ({ id, name, color }))
    return jsonResponse({ data: { issueLabels: paginate(teamLabels, graphql.variables) } })
  }
  return handleProjectQuery(graphql, state.projects)
}

const makeFakeLinear = (seed: {
  readonly teams: readonly FakeTeam[]
  readonly labels: readonly FakeLabel[]
  readonly projects?: readonly FakeProject[]
  readonly priorities?: readonly FakePriority[]
  readonly workspaces?: Readonly<Record<string, FakeWorkspace>>
  readonly rejectedKeys?: readonly string[]
}) => {
  const labels = [...seed.labels]
  const teams = [...seed.teams]
  const projects = [...(seed.projects ?? [])]
  const priorities = [...(seed.priorities ?? defaultPriorities)]
  const workspaces = new Map(
    Object.entries(seed.workspaces ?? {}).map(([apiKey, workspace]) => [
      apiKey,
      {
        viewer: workspace.viewer,
        teams: [...workspace.teams],
        labels: [...(workspace.labels ?? [])],
        priorities: [...(workspace.priorities ?? priorities)],
      },
    ]),
  )
  const rejectedKeys = new Set(seed.rejectedKeys)
  const requests: GraphQLRequest[] = []
  const handler: Handler = (request) => {
    const graphql = readRequest(request)
    const apiKey = request.headers.authorization
    if (apiKey !== undefined && rejectedKeys.has(apiKey)) {
      return jsonResponse({ errors: [{ message: "Authentication required" }] }, 401)
    }
    requests.push(apiKey === undefined ? graphql : { ...graphql, authorization: apiKey })
    const scoped = apiKey === undefined ? undefined : workspaces.get(apiKey)
    const state: FakeState = {
      teams: scoped?.teams ?? teams,
      labels: scoped?.labels ?? labels,
      projects,
      priorities: scoped?.priorities ?? priorities,
    }
    return (
      handleMutation(graphql, state) ??
      handleQuery(graphql, state, scoped?.viewer ?? defaultViewer) ??
      jsonResponse({ errors: [{ message: `Unexpected query: ${graphql.query}` }] }, 400)
    )
  }
  return { handler, requests }
}

const configLayer = (env: Readonly<Record<string, string>>) =>
  ConfigProvider.layer(ConfigProvider.fromEnvRecord(env))

type ApiLayerOptions = {
  readonly files?: Map<string, string>
  readonly stdio?: Partial<Stdio.Stdio>
  readonly env?: Readonly<Record<string, string>>
  readonly repositories?: readonly RepositorySeed[]
  readonly profiles?: readonly ProfileSeed[]
  readonly cache?: CacheSeed
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
  const database = databaseLayer(options.repositories, options.profiles, options.cache)
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
  const teams = TeamService.layer.pipe(Layer.provide(Layer.mergeAll(gateway, client)))
  const contextCacheLayer = ContextCache.layer.pipe(Layer.provide(database))
  const contextResolver = ContextResolver.layer.pipe(
    Layer.provide(Layer.mergeAll(auth, gateway, teams, repoConfig, identity, contextCacheLayer)),
  )
  const repoTeam = RepoTeam.layer.pipe(Layer.provide(Layer.mergeAll(teams, repoConfig)))
  const teamContext = TeamContext.layer.pipe(Layer.provide(contextResolver))
  const labels = LabelService.layer.pipe(Layer.provide(Layer.mergeAll(gateway, client, repoTeam)))
  const projects = ProjectService.layer.pipe(
    Layer.provide(Layer.mergeAll(gateway, client, repoTeam)),
  )
  const reader = IssueReader.layer.pipe(Layer.provide(Layer.mergeAll(gateway, contextResolver)))
  const writer = IssueWriter.layer.pipe(Layer.provide(Layer.mergeAll(gateway, contextResolver)))
  const issueWrite = IssueWriteApi.layer.pipe(
    Layer.provide(Layer.mergeAll(contextResolver, writer)),
  )
  const defaults = IssueDefaultsService.layer.pipe(
    Layer.provide(Layer.mergeAll(labels, repoConfig, repoTeam)),
  )
  const link = LinkService.layer.pipe(
    Layer.provide(Layer.mergeAll(teams, labels, repoConfig, platform, auth, gateway)),
  )
  return Layer.mergeAll(
    configLayer(options.env ?? defaultEnv),
    auth,
    gateway,
    client,
    teams,
    repoTeam,
    contextCacheLayer,
    contextResolver,
    teamContext,
    reader,
    writer,
    labels,
    projects,
    repoConfig,
    identity,
    defaults,
    issueWrite,
    link,
  )
}

export { apiLayer, type ApiLayerOptions, makeFakeLinear }
