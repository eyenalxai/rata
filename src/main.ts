#!/usr/bin/env bun
import { BunRuntime, BunServices } from "@effect/platform-bun"
import { Effect, Layer } from "effect"
import { FetchHttpClient, HttpClient } from "effect/http"

import { LinearClient } from "@/api/client"
import { IssueApi } from "@/api/issue"
import { IssueWriteApi } from "@/api/issue-write"
import { LabelService } from "@/api/label"
import { ProjectService } from "@/api/project"
import { RepoTeam } from "@/api/repo-team"
import { TeamService } from "@/api/team"
import { helpLayer } from "@/cli/help"
import { runCli } from "@/cli/run"
import { Auth } from "@/config/auth"
import { IssueDefaultsService } from "@/config/defaults"
import { LinkService } from "@/config/link"
import { RepoConfigService } from "@/config/repo"
import { RepositoryIdentity } from "@/config/repo-identity"
import { TeamContext } from "@/context/team"
import { Database } from "@/db/database"
import { makeClient } from "@/linear/client"
import { LinearAuthError } from "@/linear/errors"
import { LinearGateway, makeLinearGateway } from "@/linear/gateway"
import { ContextCache } from "@/local/context-cache"

const platformLayer = BunServices.layer
const databaseLayer = Database.layer.pipe(Layer.provide(platformLayer))
const repoIdentityLayer = RepositoryIdentity.layer.pipe(Layer.provide(platformLayer))
const repoConfigLayer = RepoConfigService.layer.pipe(
  Layer.provide(Layer.mergeAll(databaseLayer, repoIdentityLayer, platformLayer)),
)
const authLayer = Auth.layer.pipe(
  Layer.provide(Layer.mergeAll(repoConfigLayer, databaseLayer, platformLayer)),
)
const gatewayLayer = Layer.effect(
  LinearGateway,
  Effect.gen(function* linearGatewayLayer() {
    const auth = yield* Auth
    const http = yield* HttpClient.HttpClient
    const key = () =>
      auth.require.pipe(
        Effect.map((resolved) => resolved.key),
        Effect.mapError((error) => new LinearAuthError({ message: error.message, cause: error })),
      )
    return LinearGateway.of(makeLinearGateway(makeClient(http, key)))
  }),
).pipe(Layer.provide(authLayer), Layer.provide(FetchHttpClient.layer))
const clientLayer = LinearClient.layer.pipe(Layer.provide(gatewayLayer))
const teamLayer = TeamService.layer.pipe(Layer.provide(gatewayLayer))
const repoTeamLayer = RepoTeam.layer.pipe(Layer.provide(Layer.mergeAll(teamLayer, repoConfigLayer)))
const contextCacheLayer = ContextCache.layer.pipe(Layer.provide(databaseLayer))
const teamContextLayer = TeamContext.layer.pipe(
  Layer.provide(
    Layer.mergeAll(authLayer, gatewayLayer, teamLayer, repoConfigLayer, contextCacheLayer),
  ),
)
const issueLayer = IssueApi.layer.pipe(
  Layer.provide(Layer.mergeAll(gatewayLayer, repoTeamLayer, teamContextLayer)),
)
const labelLayer = LabelService.layer.pipe(
  Layer.provide(Layer.mergeAll(gatewayLayer, repoTeamLayer)),
)
const projectLayer = ProjectService.layer.pipe(
  Layer.provide(Layer.mergeAll(gatewayLayer, repoTeamLayer)),
)
const defaultsLayer = IssueDefaultsService.layer.pipe(
  Layer.provide(Layer.mergeAll(labelLayer, repoConfigLayer, repoTeamLayer)),
)
const linkLayer = LinkService.layer.pipe(
  Layer.provide(repoConfigLayer),
  Layer.provide(teamLayer),
  Layer.provide(labelLayer),
  Layer.provide(platformLayer),
  Layer.provide(authLayer),
  Layer.provide(clientLayer),
)
const issueWriteLayer = IssueWriteApi.layer.pipe(
  Layer.provide(
    Layer.mergeAll(clientLayer, projectLayer, repoConfigLayer, repoTeamLayer, teamContextLayer),
  ),
)
const appLayer = Layer.mergeAll(
  authLayer,
  gatewayLayer,
  clientLayer,
  issueLayer,
  teamLayer,
  labelLayer,
  projectLayer,
  repoConfigLayer,
  repoIdentityLayer,
  repoTeamLayer,
  defaultsLayer,
  linkLayer,
  issueWriteLayer,
  contextCacheLayer,
  teamContextLayer,
  platformLayer,
  helpLayer,
)

const program = runCli("0.10.0").pipe(
  // oxlint-disable-next-line effecttsgo/strict-effect-provide -- This is the application entry point; it owns the layer graph.
  Effect.provide(appLayer),
)

BunRuntime.runMain(program)
