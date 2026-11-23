import type { CacheSeed, ProfileSeed, RepositorySeed } from "@test/database-harness"
import type { MemorySeed } from "@test/fake-linear/gateway/model"

import { databaseLayer } from "@test/database-harness"
import { memoryGatewayLayer } from "@test/fake-linear/gateway/layer"
import { defaultEnv } from "@test/fake-linear/model"
import { ConfigProvider, Effect, FileSystem, Layer, Path, Stdio } from "effect"

import type { LinearGatewayShape } from "@/linear/gateway"

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
import { LinearGateway } from "@/linear/gateway"
import { ContextCache } from "@/local/context-cache"
import { IssueApply } from "@/tracker/apply"
import { IssueReader } from "@/tracker/read"
import { IssueWorkflow } from "@/tracker/workflow"
import { IssueWriter } from "@/tracker/write"

type MemoryLayerOptions = {
  readonly files?: Map<string, string>
  readonly stdio?: Partial<Stdio.Stdio>
  readonly env?: Readonly<Record<string, string>>
  readonly repositories?: readonly RepositorySeed[]
  readonly profiles?: readonly ProfileSeed[]
  readonly cache?: CacheSeed
  readonly gateway?: LinearGatewayShape
}

const configLayer = (env: Readonly<Record<string, string>>) =>
  ConfigProvider.layer(ConfigProvider.fromEnvRecord(env))

const memoryApiLayer = (seed: MemorySeed, options: MemoryLayerOptions = {}) => {
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
  const gateway =
    options.gateway === undefined
      ? memoryGatewayLayer(seed)
      : Layer.succeed(LinearGateway, options.gateway)
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
  const apply = IssueApply.layer.pipe(
    Layer.provide(Layer.mergeAll(gateway, contextResolver, reader)),
  )
  const workflow = IssueWorkflow.layer.pipe(Layer.provide(Layer.mergeAll(reader, apply)))
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
    apply,
    workflow,
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

export { memoryApiLayer, type MemoryLayerOptions }
