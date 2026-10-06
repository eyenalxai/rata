import type { MemoryTree } from "@test/memory-file-system"

import { databaseLayer } from "@test/database-harness"
import { memoryFileSystem } from "@test/memory-file-system"
import { recordingConsole } from "@test/recording-console"
import { describe, expect, test } from "bun:test"
import { Console, Effect, Layer, Option, Path } from "effect"

import { RepoConfigService } from "@/config/repo"
import { RepositoryIdentity } from "@/config/repo-identity"
import { Database } from "@/db/database"
import { repositories } from "@/db/schema"

const withRepoConfig = <A, E>(
  tree: MemoryTree,
  lines: string[],
  use: Effect.Effect<A, E, RepoConfigService | Database>,
): Promise<A> => {
  const platform = Layer.mergeAll(memoryFileSystem(tree), Path.layer)
  const identity = RepositoryIdentity.layer.pipe(Layer.provide(platform))
  const database = databaseLayer()
  const repoConfig = RepoConfigService.layer.pipe(
    Layer.provide(Layer.mergeAll(platform, identity, database)),
  )
  return use.pipe(
    Effect.provide(Layer.mergeAll(repoConfig, database)),
    Effect.provideService(Console.Console, recordingConsole(lines)),
    Effect.runPromise,
  )
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

describe("RepoConfigService.write", () => {
  test("writes one row for the Git common directory from a subdirectory", async () => {
    const lines: string[] = []
    const result = await withRepoConfig(
      repoTree,
      lines,
      Effect.gen(function* writeConfig() {
        const service = yield* RepoConfigService
        const database = yield* Database
        yield* service.write("/repo/src", { team: "RAT", project: "rata" })
        const rows = yield* database.drizzle.select().from(repositories).all()
        const atRoot = yield* service.read("/repo")
        const atSub = yield* service.read("/repo/src")
        return { atRoot, atSub, rows }
      }),
    )

    expect(result.rows).toEqual([
      { key: "/repo/.git", team: "RAT", project: "rata", workspace: null },
    ])
    expect(result.atRoot).toEqual(Option.some({ team: "RAT", project: "rata" }))
    expect(result.atSub).toEqual(Option.some({ team: "RAT", project: "rata" }))
    expect(lines).toEqual([])
  })

  test("upserts over an existing row and clears the absent fields", async () => {
    const result = await withRepoConfig(
      repoTree,
      [],
      Effect.gen(function* upsertConfig() {
        const service = yield* RepoConfigService
        yield* service.write("/repo", { team: "OLD", project: "old", workspace: "work" })
        yield* service.write("/repo", { team: "RAT" })
        return yield* service.read("/repo")
      }),
    )

    expect(result).toEqual(Option.some({ team: "RAT" }))
  })

  test("keeps an existing link when it writes from a worktree", async () => {
    const result = await withRepoConfig(
      worktreeTree,
      [],
      Effect.gen(function* readWorktree() {
        const service = yield* RepoConfigService
        yield* service.write("/repo", { team: "RAT", workspace: "work" })
        return yield* service.read("/topic/src")
      }),
    )

    expect(result).toEqual(Option.some({ team: "RAT", workspace: "work" }))
  })
})

describe("RepoConfigService.read", () => {
  test("returns none without a row and without a legacy file", async () => {
    const lines: string[] = []
    const result = await withRepoConfig(
      nonGitTree,
      lines,
      Effect.gen(function* readNone() {
        const service = yield* RepoConfigService
        return yield* service.read("/data/project/src")
      }),
    )

    expect(result).toEqual(Option.none())
    expect(lines).toEqual([])
  })

  test("finds the row of a stored ancestor outside Git", async () => {
    const result = await withRepoConfig(
      nonGitTree,
      [],
      Effect.gen(function* readAncestor() {
        const service = yield* RepoConfigService
        yield* service.write("/data/project", { team: "RAT", project: "rata" })
        const atParent = yield* service.read("/data/project")
        const atChild = yield* service.read("/data/project/src")
        return { atChild, atParent }
      }),
    )

    expect(result.atParent).toEqual(Option.some({ team: "RAT", project: "rata" }))
    expect(result.atChild).toEqual(Option.some({ team: "RAT", project: "rata" }))
  })

  test("imports the closest legacy file for the Git common directory and deletes it", async () => {
    const tree: MemoryTree = {
      directories: ["/repo", "/repo/.git", "/repo/src"],
      files: new Map([
        ["/repo/.rata.json", JSON.stringify({ team: "OLD" })],
        ["/repo/src/.rata.json", JSON.stringify({ team: "RAT", workspace: "work" })],
      ]),
    }
    const lines: string[] = []
    const result = await withRepoConfig(
      tree,
      lines,
      Effect.gen(function* importLegacy() {
        const service = yield* RepoConfigService
        const database = yield* Database
        const config = yield* service.read("/repo/src")
        const rows = yield* database.drizzle.select().from(repositories).all()
        return { config, rows }
      }),
    )

    expect(result.config).toEqual(Option.some({ team: "RAT", workspace: "work" }))
    expect(result.rows).toEqual([
      { key: "/repo/.git", team: "RAT", project: null, workspace: "work" },
    ])
    expect(tree.files.has("/repo/src/.rata.json")).toBe(false)
    expect(tree.files.has("/repo/.rata.json")).toBe(true)
    expect(lines).toEqual(["Migrated repository config from /repo/src/.rata.json."])
  })

  test("imports a legacy file outside Git from the current directory only", async () => {
    const tree: MemoryTree = {
      directories: ["/data", "/data/project", "/data/project/src"],
      files: new Map([["/data/project/.rata.json", JSON.stringify({ team: "RAT" })]]),
    }
    const lines: string[] = []
    const result = await withRepoConfig(
      tree,
      lines,
      Effect.gen(function* importOutsideGit() {
        const service = yield* RepoConfigService
        const atChild = yield* service.read("/data/project/src")
        const atParent = yield* service.read("/data/project")
        return { atChild, atParent }
      }),
    )

    expect(result.atChild).toEqual(Option.none())
    expect(result.atParent).toEqual(Option.some({ team: "RAT" }))
    expect(tree.files.has("/data/project/.rata.json")).toBe(false)
    expect(lines).toEqual(["Migrated repository config from /data/project/.rata.json."])
  })

  test("keeps a row over a leftover legacy file", async () => {
    const tree: MemoryTree = {
      directories: ["/repo", "/repo/.git", "/repo/src"],
      files: new Map([["/repo/.rata.json", JSON.stringify({ team: "OLD" })]]),
    }
    const lines: string[] = []
    const result = await withRepoConfig(
      tree,
      lines,
      Effect.gen(function* rowWins() {
        const service = yield* RepoConfigService
        yield* service.write("/repo", { team: "RAT" })
        return yield* service.read("/repo/src")
      }),
    )

    expect(result).toEqual(Option.some({ team: "RAT" }))
    expect(tree.files.has("/repo/.rata.json")).toBe(true)
    expect(lines).toEqual([])
  })

  test("fails on a corrupt legacy file and leaves it on disk", async () => {
    const tree: MemoryTree = {
      directories: ["/repo", "/repo/.git"],
      files: new Map([["/repo/.rata.json", "{ not json"]]),
    }
    const lines: string[] = []
    const result = await withRepoConfig(
      tree,
      lines,
      Effect.gen(function* corruptLegacy() {
        const service = yield* RepoConfigService
        const database = yield* Database
        const error = yield* Effect.flip(service.read("/repo"))
        const rows = yield* database.drizzle.select().from(repositories).all()
        return { error, rows }
      }),
    )

    expect(result.error._tag).toBe("RepoConfigError")
    if (result.error._tag === "RepoConfigError") {
      expect(result.error.message).toBe(
        "The repository config at /repo/.rata.json is not valid JSON.",
      )
    }
    expect(result.rows).toEqual([])
    expect(tree.files.has("/repo/.rata.json")).toBe(true)
    expect(lines).toEqual([])
  })
})

describe("RepoConfigService.remove", () => {
  test("removes the row and reports whether it existed", async () => {
    const result = await withRepoConfig(
      repoTree,
      [],
      Effect.gen(function* removeRow() {
        const service = yield* RepoConfigService
        yield* service.write("/repo", { team: "RAT" })
        const first = yield* service.remove("/repo")
        const second = yield* service.remove("/repo")
        return { first, second, stored: yield* service.read("/repo") }
      }),
    )

    expect(result.first).toBe(true)
    expect(result.second).toBe(false)
    expect(result.stored).toEqual(Option.none())
  })

  test("removes the row of a stored ancestor outside Git", async () => {
    const result = await withRepoConfig(
      nonGitTree,
      [],
      Effect.gen(function* removeAncestor() {
        const service = yield* RepoConfigService
        yield* service.write("/data/project", { team: "RAT" })
        const removed = yield* service.remove("/data/project/src")
        return { removed, stored: yield* service.read("/data/project") }
      }),
    )

    expect(result.removed).toBe(true)
    expect(result.stored).toEqual(Option.none())
  })
})
