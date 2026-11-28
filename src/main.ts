#!/usr/bin/env bun
import { BunRuntime, BunServices } from "@effect/platform-bun"
import { Effect, Layer } from "effect"
import { Command } from "effect/cli"
import { FetchHttpClient, HttpClient } from "effect/http"

import { LinearClient } from "@/api/client"
import { IssueWriteApi } from "@/api/issue-write"
import { LabelService } from "@/api/label"
import { ProjectService } from "@/api/project"
import { RepoTeam } from "@/api/repo-team"
import { TeamService } from "@/api/team"
import { helpLayer } from "@/cli/help"
import { issueCommand } from "@/cli/issue"
import {
  authCommand,
  configCommand,
  createRoot,
  labelCommand,
  linkCommand,
  projectCommand,
  statusCommand,
  teamCommand,
  unlinkCommand,
  whoamiCommand,
  workspaceCommand,
} from "@/cli/registry"
import { runCli } from "@/cli/runner"
import { Auth } from "@/config/auth"
import { IssueDefaultsService } from "@/config/defaults"
import { LinkService } from "@/config/link"
import { RepoConfigService } from "@/config/repo"
import { RepositoryIdentity } from "@/config/repo-identity"
import { ContextResolver } from "@/context/resolve"
import { TeamContext } from "@/context/team"
import { Database } from "@/db/database"
import { makeClient } from "@/linear/client"
import { LinearAuthError, LinearInternalError } from "@/linear/errors"
import { LinearGateway, makeLinearGateway } from "@/linear/gateway"
import { ContextCache } from "@/local/context-cache"
import { IssueApply } from "@/tracker/apply"
import { IssuePublish } from "@/tracker/publish"
import { IssueReader } from "@/tracker/read"
import { IssueWorkflow } from "@/tracker/workflow"
import { IssueWriter } from "@/tracker/write"

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
        Effect.catchTags({
          AuthStoreError: (error) =>
            Effect.fail(new LinearAuthError({ message: error.message, cause: error })),
          DatabaseError: (error) =>
            Effect.fail(new LinearInternalError({ message: error.message, cause: error })),
        }),
      )
    return LinearGateway.of(makeLinearGateway(makeClient(http, key)))
  }),
).pipe(Layer.provide(authLayer), Layer.provide(FetchHttpClient.layer))
const clientLayer = LinearClient.layer.pipe(Layer.provide(gatewayLayer))
const teamLayer = TeamService.layer.pipe(Layer.provide(Layer.mergeAll(gatewayLayer, clientLayer)))
const contextCacheLayer = ContextCache.layer.pipe(Layer.provide(databaseLayer))
const contextResolverLayer = ContextResolver.layer.pipe(
  Layer.provide(
    Layer.mergeAll(
      authLayer,
      gatewayLayer,
      teamLayer,
      repoConfigLayer,
      repoIdentityLayer,
      contextCacheLayer,
    ),
  ),
)
const teamContextLayer = TeamContext.layer.pipe(Layer.provide(contextResolverLayer))
const repoTeamLayer = RepoTeam.layer.pipe(Layer.provide(Layer.mergeAll(teamLayer, repoConfigLayer)))
const readerLayer = IssueReader.layer.pipe(
  Layer.provide(Layer.mergeAll(gatewayLayer, contextResolverLayer)),
)
const applyLayer = IssueApply.layer.pipe(
  Layer.provide(Layer.mergeAll(gatewayLayer, contextResolverLayer, readerLayer)),
)
const workflowLayer = IssueWorkflow.layer.pipe(
  Layer.provide(Layer.mergeAll(readerLayer, applyLayer)),
)
const publishLayer = IssuePublish.layer.pipe(
  Layer.provide(Layer.mergeAll(gatewayLayer, contextResolverLayer)),
)
const labelLayer = LabelService.layer.pipe(
  Layer.provide(Layer.mergeAll(gatewayLayer, clientLayer, repoTeamLayer)),
)
const projectLayer = ProjectService.layer.pipe(
  Layer.provide(Layer.mergeAll(gatewayLayer, clientLayer, repoTeamLayer)),
)
const writerLayer = IssueWriter.layer.pipe(
  Layer.provide(Layer.mergeAll(gatewayLayer, contextResolverLayer)),
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
  Layer.provide(gatewayLayer),
)
const issueWriteLayer = IssueWriteApi.layer.pipe(
  Layer.provide(Layer.mergeAll(contextResolverLayer, writerLayer)),
)
const workLayer = Layer.mergeAll(
  authLayer,
  gatewayLayer,
  clientLayer,
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
  contextResolverLayer,
  teamContextLayer,
  readerLayer,
  applyLayer,
  workflowLayer,
  publishLayer,
  writerLayer,
  platformLayer,
)

const authAdminLayer = Layer.mergeAll(authLayer, gatewayLayer)
const unlinkAdminLayer = Layer.mergeAll(repoConfigLayer, repoIdentityLayer)
const configAdminLayer = Layer.mergeAll(defaultsLayer, repoIdentityLayer)
const teamAdminLayer = Layer.mergeAll(teamLayer, repoConfigLayer, repoIdentityLayer)
const projectAdminLayer = Layer.mergeAll(projectLayer, repoTeamLayer)
const labelAdminLayer = Layer.mergeAll(labelLayer, repoTeamLayer)
const statusAdminLayer = Layer.mergeAll(
  authLayer,
  repoConfigLayer,
  repoIdentityLayer,
  teamContextLayer,
)
const workspaceAdminLayer = Layer.mergeAll(authLayer, gatewayLayer)

const root = createRoot([
  Command.provide(authCommand, authAdminLayer),
  Command.provide(whoamiCommand, gatewayLayer),
  Command.provide(statusCommand, statusAdminLayer),
  Command.provide(configCommand, configAdminLayer),
  Command.provide(linkCommand, linkLayer),
  Command.provide(unlinkCommand, unlinkAdminLayer),
  Command.provide(workspaceCommand, workspaceAdminLayer),
  Command.provide(issueCommand, workLayer),
  Command.provide(teamCommand, teamAdminLayer),
  Command.provide(projectCommand, projectAdminLayer),
  Command.provide(labelCommand, labelAdminLayer),
])

const program = runCli("0.10.0", root).pipe(
  Effect.provide(Layer.mergeAll(platformLayer, helpLayer)),
)

BunRuntime.runMain(program)
