#!/usr/bin/env bun
import { BunRuntime, BunServices } from "@effect/platform-bun"
import { Effect, Layer } from "effect"
import { CliError, Command } from "effect/cli"
import { FetchHttpClient } from "effect/http"

import { LinearClient } from "@/api/client"
import { IssueApi } from "@/api/issue"
import { IssueWriteApi } from "@/api/issue-write"
import { LabelService } from "@/api/label"
import { MissionApi } from "@/api/mission"
import { ProjectService } from "@/api/project"
import { RepoTeam } from "@/api/repo-team"
import { TeamService } from "@/api/team"
import { reportCliError } from "@/cli/exit"
import { root } from "@/cli/root"
import { Auth } from "@/config/auth"
import { IssueDefaultsService } from "@/config/defaults"
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
const teamLayer = TeamService.layer.pipe(Layer.provide(clientLayer))
const repoTeamLayer = RepoTeam.layer.pipe(Layer.provide(Layer.mergeAll(teamLayer, repoConfigLayer)))
const issueLayer = IssueApi.layer.pipe(Layer.provide(Layer.mergeAll(clientLayer, repoTeamLayer)))
const labelLayer = LabelService.layer.pipe(
  Layer.provide(Layer.mergeAll(clientLayer, repoTeamLayer)),
)
const projectLayer = ProjectService.layer.pipe(
  Layer.provide(Layer.mergeAll(clientLayer, repoTeamLayer)),
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
    Layer.mergeAll(clientLayer, labelLayer, projectLayer, repoConfigLayer, repoTeamLayer),
  ),
)
const missionLayer = MissionApi.layer.pipe(
  Layer.provide(Layer.mergeAll(clientLayer, issueWriteLayer)),
)
const appLayer = Layer.mergeAll(
  authLayer,
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
  missionLayer,
  platformLayer,
)

const program = Command.run(root, { version: "0.8.0" }).pipe(
  Effect.catchIf(CliError.isCliError, reportCliError),
  // oxlint-disable-next-line effecttsgo/strict-effect-provide -- This is the application entry point; it owns the layer graph.
  Effect.provide(appLayer),
)

BunRuntime.runMain(program)
