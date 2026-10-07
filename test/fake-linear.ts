import type { ProfileSeed, RepositorySeed } from "@test/database-harness"
import type {
  FakeLabel,
  FakeProject,
  FakeTeam,
  FakeViewer,
  FakeWorkspace,
  GraphQLRequest,
  Handler,
} from "@test/fake-linear/model"

import { databaseLayer } from "@test/database-harness"
import {
  defaultEnv,
  defaultViewer,
  inputOf,
  jsonResponse,
  paginate,
  readRequest,
  stringField,
} from "@test/fake-linear/model"
import { handleProjectMutation, handleProjectQuery } from "@test/fake-linear/project"
import { ConfigProvider, Effect, FileSystem, Layer, Path, Stdio } from "effect"
import { HttpClient, HttpClientResponse } from "effect/http"

import { LinearClient } from "@/api/client"
import { IssueApi } from "@/api/issue"
import { IssueWriteApi } from "@/api/issue-write"
import { LabelService } from "@/api/label"
import { ProjectService } from "@/api/project"
import { RepoTeam } from "@/api/repo-team"
import { TeamService } from "@/api/team"
import { Auth } from "@/config/auth"
import { LinkService } from "@/config/link"
import { RepoConfigService } from "@/config/repo"
import { RepositoryIdentity } from "@/config/repo-identity"

type FakeState = {
  readonly teams: FakeTeam[]
  readonly labels: FakeLabel[]
  readonly projects: FakeProject[]
}

const handleMutation = (graphql: GraphQLRequest, state: FakeState): Response | undefined => {
  const query = graphql.query
  if (query.includes("mutation TeamCreate")) {
    const input = inputOf(graphql.variables)
    const name = stringField(input, "name")
    const created = {
      id: `team-${state.teams.length + 1}`,
      key: typeof input.key === "string" ? input.key : "AUTO",
      name,
      timezone: typeof input.timezone === "string" ? input.timezone : "America/Los_Angeles",
    }
    state.teams.push(created)
    return jsonResponse({ data: { teamCreate: { success: true, team: created } } })
  }
  if (query.includes("mutation TeamUpdate")) {
    const id = stringField(graphql.variables, "id")
    const timezone = stringField(inputOf(graphql.variables), "timezone")
    const index = state.teams.findIndex((item) => item.id === id)
    const current = state.teams[index]
    if (current === undefined) {
      return jsonResponse({ data: { teamUpdate: { success: false, team: null } } })
    }
    const updated = { ...current, timezone }
    state.teams[index] = updated
    return jsonResponse({ data: { teamUpdate: { success: true, team: updated } } })
  }
  if (query.includes("mutation CreateLabel")) {
    const input = inputOf(graphql.variables)
    const name = stringField(input, "name")
    const created = {
      id: `label-${state.labels.length + 1}`,
      name,
      color: "#5E6AD2",
      teamId: stringField(input, "teamId"),
    }
    state.labels.push(created)
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
    const index = state.teams.findIndex((item) => item.id === id)
    if (index === -1) {
      return jsonResponse({ data: { teamDelete: { success: false, entityId: id } } })
    }
    state.teams.splice(index, 1)
    return jsonResponse({ data: { teamDelete: { success: true, entityId: id } } })
  }
  return handleProjectMutation(graphql, state.projects)
}

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
  if (query.includes("query Teams")) {
    return jsonResponse({ data: { teams: paginate(state.teams, graphql.variables) } })
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
  readonly workspaces?: Readonly<Record<string, FakeWorkspace>>
  readonly rejectedKeys?: readonly string[]
}) => {
  const labels = [...seed.labels]
  const teams = [...seed.teams]
  const projects = [...(seed.projects ?? [])]
  const workspaces = new Map(
    Object.entries(seed.workspaces ?? {}).map(([apiKey, workspace]) => [
      apiKey,
      {
        viewer: workspace.viewer,
        teams: [...workspace.teams],
        labels: [...(workspace.labels ?? [])],
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
  const database = databaseLayer(options.repositories, options.profiles)
  const identity = RepositoryIdentity.layer.pipe(Layer.provide(platform))
  const repoConfig = RepoConfigService.layer.pipe(
    Layer.provide(Layer.mergeAll(platform, database, identity)),
  )
  const auth = Auth.layer.pipe(Layer.provide(Layer.mergeAll(repoConfig, platform, database)))
  const client = LinearClient.layer.pipe(
    Layer.provide(Layer.mergeAll(auth, Layer.succeed(HttpClient.HttpClient, http))),
  )
  const teams = TeamService.layer.pipe(Layer.provide(client))
  const repoTeam = RepoTeam.layer.pipe(Layer.provide(Layer.mergeAll(teams, repoConfig)))
  const labels = LabelService.layer.pipe(Layer.provide(Layer.mergeAll(client, repoTeam)))
  const projects = ProjectService.layer.pipe(Layer.provide(Layer.mergeAll(client, repoTeam)))
  const issue = IssueApi.layer.pipe(Layer.provide(Layer.mergeAll(client, repoTeam)))
  const issueWrite = IssueWriteApi.layer.pipe(
    Layer.provide(Layer.mergeAll(client, labels, projects, repoConfig, repoTeam)),
  )
  const link = LinkService.layer.pipe(
    Layer.provide(Layer.mergeAll(teams, repoConfig, platform, auth, client)),
  )
  return Layer.mergeAll(
    configLayer(options.env ?? defaultEnv),
    auth,
    client,
    teams,
    repoTeam,
    labels,
    projects,
    issue,
    repoConfig,
    issueWrite,
    link,
  )
}

export { apiLayer, type ApiLayerOptions, makeFakeLinear }
