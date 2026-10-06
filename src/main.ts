#!/usr/bin/env bun
import { BunRuntime, BunServices } from "@effect/platform-bun"
import { Effect, Layer } from "effect"
import { Command } from "effect/cli"
import { FetchHttpClient } from "effect/http"

import { LinearClient } from "@/api/client"
import { IssueApi } from "@/api/issue"
import { IssueWriteApi } from "@/api/issue-write"
import { LabelService } from "@/api/label"
import { ProjectService } from "@/api/project"
import { TeamService } from "@/api/team"
import { root } from "@/cli/root"
import { Auth } from "@/config/auth"
import { LinkService } from "@/config/link"
import { RepoConfigService } from "@/config/repo"
import { RepositoryIdentity } from "@/config/repo-identity"
import { Database } from "@/db/database"

const platformLayer = BunServices.layer
const databaseLayer = Database.layer.pipe(Layer.provide(platformLayer))
const repoIdentityLayer = RepositoryIdentity.layer.pipe(Layer.provide(platformLayer))
const repoConfigLayer = RepoConfigService.layer.pipe(
  Layer.provide(Layer.mergeAll(databaseLayer, repoIdentityLayer, platformLayer)),
)
const authLayer = Auth.layer.pipe(
  Layer.provide(Layer.mergeAll(repoConfigLayer, databaseLayer, platformLayer)),
)
const clientLayer = LinearClient.layer.pipe(
  Layer.provide(authLayer),
  Layer.provide(FetchHttpClient.layer),
)
const issueLayer = IssueApi.layer.pipe(Layer.provide(clientLayer))
const teamLayer = TeamService.layer.pipe(Layer.provide(clientLayer))
const labelLayer = LabelService.layer.pipe(Layer.provide(clientLayer))
const projectLayer = ProjectService.layer.pipe(
  Layer.provide(clientLayer),
  Layer.provide(teamLayer),
  Layer.provide(repoConfigLayer),
)
const linkLayer = LinkService.layer.pipe(
  Layer.provide(repoConfigLayer),
  Layer.provide(teamLayer),
  Layer.provide(platformLayer),
  Layer.provide(authLayer),
  Layer.provide(clientLayer),
)
const issueWriteLayer = IssueWriteApi.layer.pipe(
  Layer.provide(Layer.mergeAll(clientLayer, teamLayer, labelLayer, projectLayer, repoConfigLayer)),
)
const appLayer = Layer.mergeAll(
  authLayer,
  clientLayer,
  issueLayer,
  teamLayer,
  labelLayer,
  projectLayer,
  repoConfigLayer,
  linkLayer,
  issueWriteLayer,
  platformLayer,
)

// oxlint-disable-next-line effecttsgo/strict-effect-provide -- This is the application entry point; it owns the layer graph.
const program = Command.run(root, { version: "0.4.0" }).pipe(Effect.provide(appLayer))

BunRuntime.runMain(program)
