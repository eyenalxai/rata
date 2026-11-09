import type { MemoryTree } from "@test/memory-file-system"

import { databaseLayer } from "@test/database-harness"
import { memoryFileSystem } from "@test/memory-file-system"
import { recordingConsole } from "@test/recording-console"
import { Console, Effect, Layer, Path } from "effect"

import type { Database } from "@/db/database"

import { RepoConfigService } from "@/config/repo"
import { RepositoryIdentity } from "@/config/repo-identity"

const withRepoConfig = <A, E>(
  tree: MemoryTree,
  lines: string[],
  use: Effect.Effect<A, E, RepoConfigService | Database>,
  console: Console.Console = recordingConsole(lines),
): Promise<A> => {
  const platform = Layer.mergeAll(memoryFileSystem(tree), Path.layer)
  const identity = RepositoryIdentity.layer.pipe(Layer.provide(platform))
  const database = databaseLayer()
  const repoConfig = RepoConfigService.layer.pipe(
    Layer.provide(Layer.mergeAll(platform, identity, database)),
  )
  return use.pipe(
    Effect.provide(Layer.mergeAll(repoConfig, database)),
    Effect.provideService(Console.Console, console),
    Effect.runPromise,
  )
}

const emptyDefaults = {
  defaultAssignee: null,
  defaultLabels: null,
  defaultPriority: null,
}

const repoTree: MemoryTree = {
  directories: ["/repo", "/repo/.git", "/repo/src"],
  files: new Map(),
}

const worktreeTree: MemoryTree = {
  directories: [
    "/repo",
    "/repo/.git",
    "/repo/.git/worktrees",
    "/repo/.git/worktrees/topic",
    "/topic",
    "/topic/src",
  ],
  files: new Map([
    ["/topic/.git", "gitdir: /repo/.git/worktrees/topic\n"],
    ["/repo/.git/worktrees/topic/commondir", "../..\n"],
  ]),
}

const nonGitTree: MemoryTree = {
  directories: ["/data", "/data/project", "/data/project/src"],
  files: new Map(),
}

export { emptyDefaults, nonGitTree, repoTree, withRepoConfig, worktreeTree }
