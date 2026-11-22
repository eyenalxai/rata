import { Effect, Option } from "effect"

import type { RepoConfigService } from "@/config/repo"
import type { RepositoryIdentity } from "@/config/repo-identity"
import type { RepoConfig } from "@/config/repo/model"
import type { ContextResolveError, ResolveOptions } from "@/context/resolve/model"
import type { Viewer } from "@/linear/decode/viewer"

import { RepoConfigError, currentDirectory } from "@/config/repo"

type ContextSourcesDependencies = {
  readonly identity: RepositoryIdentity["Service"]
  readonly repoConfig: RepoConfigService["Service"]
  readonly loadViewer: (
    profile: string,
    keyHash: string,
    refresh: boolean,
    now: number,
  ) => Effect.Effect<Viewer, ContextResolveError>
}

const makeContextSources = ({ identity, loadViewer, repoConfig }: ContextSourcesDependencies) => {
  const locateRoot = Effect.fn("ContextResolver.locateRoot")(function* locateRepositoryRoot() {
    const location = yield* identity
      .locate(yield* currentDirectory)
      .pipe(
        Effect.mapError((error) => new RepoConfigError({ message: error.message, cause: error })),
      )
    return location.root
  })

  const loadConfig = (withTeam: boolean) =>
    Effect.gen(function* loadRepositoryConfig() {
      if (!withTeam) {
        return Option.none<RepoConfig>()
      }
      return yield* repoConfig.read(yield* currentDirectory)
    })

  const loadViewerFor = (options: ResolveOptions, profile: string, keyHash: string, now: number) =>
    options.viewer === false
      ? Effect.succeed(null)
      : loadViewer(profile, keyHash, options.refresh === true, now)

  return { loadConfig, loadViewerFor, locateRoot }
}

export { makeContextSources }
