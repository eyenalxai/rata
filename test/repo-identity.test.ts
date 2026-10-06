import { describe, expect, test } from "bun:test"
import { ByteSize, Effect, FileSystem, Layer, Option, Path } from "effect"

import type { RepositoryIdentityError, RepositoryLocation } from "@/config/repo-identity"

import { firstStoredKey, RepositoryIdentity } from "@/config/repo-identity"

type MemoryTree = {
  readonly directories: readonly string[]
  readonly files: Readonly<Record<string, string>>
}

const fileInfo = (type: FileSystem.File.Type): FileSystem.File.Info => ({
  type,
  mtime: Option.none(),
  atime: Option.none(),
  birthtime: Option.none(),
  dev: 0,
  ino: Option.none(),
  mode: type === "Directory" ? 0o755 : 0o644,
  nlink: Option.none(),
  uid: Option.none(),
  gid: Option.none(),
  rdev: Option.none(),
  size: ByteSize.bytes(0),
  blksize: Option.none(),
  blocks: Option.none(),
})

const memoryFileSystem = (tree: MemoryTree): Layer.Layer<FileSystem.FileSystem> =>
  FileSystem.layerNoop({
    exists: (target) =>
      Effect.succeed(tree.directories.includes(target) || Object.hasOwn(tree.files, target)),
    readFileString: (target) => Effect.succeed(tree.files[target] ?? ""),
    stat: (target) => {
      if (tree.directories.includes(target)) {
        return Effect.succeed(fileInfo("Directory"))
      }
      if (Object.hasOwn(tree.files, target)) {
        return Effect.succeed(fileInfo("File"))
      }
      return Effect.die(`The memory tree has no path: ${target}`)
    },
  })

const testLayer = (tree: MemoryTree): Layer.Layer<RepositoryIdentity> => {
  const platform = Layer.mergeAll(memoryFileSystem(tree), Path.layer)
  return RepositoryIdentity.layer.pipe(Layer.provide(platform))
}

const locateProgram = (tree: MemoryTree, directory: string) =>
  Effect.gen(function* locateRepository() {
    const identity = yield* RepositoryIdentity
    return yield* identity.locate(directory)
  }).pipe(Effect.provide(testLayer(tree)))

const locate = (tree: MemoryTree, directory: string): Promise<RepositoryLocation> =>
  locateProgram(tree, directory).pipe(Effect.runPromise)

const locateError = (tree: MemoryTree, directory: string): Promise<RepositoryIdentityError> =>
  locateProgram(tree, directory).pipe(Effect.flip, Effect.runPromise)

describe("RepositoryIdentity.locate", () => {
  test("locates a main checkout by its Git directory", async () => {
    const tree: MemoryTree = {
      directories: ["/repo", "/repo/.git", "/repo/src"],
      files: { "/repo/.git/HEAD": "ref: refs/heads/main\n" },
    }

    expect(await locate(tree, "/repo")).toEqual({ key: "/repo/.git", lookup: ["/repo/.git"] })
  })

  test("walks up from a subdirectory to the Git directory", async () => {
    const tree: MemoryTree = {
      directories: ["/repo", "/repo/.git", "/repo/src", "/repo/src/deep"],
      files: { "/repo/.git/HEAD": "ref: refs/heads/main\n" },
    }

    expect(await locate(tree, "/repo/src/deep")).toEqual({
      key: "/repo/.git",
      lookup: ["/repo/.git"],
    })
  })

  test("resolves an external worktree through its gitdir and commondir files", async () => {
    const tree: MemoryTree = {
      directories: [
        "/tmp/topic",
        "/tmp/topic/src",
        "/repo",
        "/repo/.git",
        "/repo/.git/worktrees",
        "/repo/.git/worktrees/topic",
      ],
      files: {
        "/tmp/topic/.git": "gitdir: /repo/.git/worktrees/topic\n",
        "/repo/.git/worktrees/topic/commondir": "../..\n",
      },
    }

    expect(await locate(tree, "/tmp/topic/src")).toEqual({
      key: "/repo/.git",
      lookup: ["/repo/.git"],
    })
  })

  test("resolves a gitdir path relative to the .git file", async () => {
    const tree: MemoryTree = {
      directories: [
        "/tmp/topic",
        "/repo",
        "/repo/.git",
        "/repo/.git/worktrees",
        "/repo/.git/worktrees/topic",
      ],
      files: {
        "/tmp/topic/.git": "gitdir: ../../repo/.git/worktrees/topic\n",
        "/repo/.git/worktrees/topic/commondir": "../..\n",
      },
    }

    expect(await locate(tree, "/tmp/topic")).toEqual({
      key: "/repo/.git",
      lookup: ["/repo/.git"],
    })
  })

  test("uses the linked gitdir when a worktree has no commondir file", async () => {
    const tree: MemoryTree = {
      directories: ["/tmp/solo", "/repo/.git/worktrees/solo"],
      files: { "/tmp/solo/.git": "gitdir: /repo/.git/worktrees/solo\n" },
    }

    expect(await locate(tree, "/tmp/solo")).toEqual({
      key: "/repo/.git/worktrees/solo",
      lookup: ["/repo/.git/worktrees/solo"],
    })
  })

  test("stops at the nearest Git entry on the way up", async () => {
    const tree: MemoryTree = {
      directories: ["/outer", "/outer/.git", "/outer/inner", "/outer/inner/.git"],
      files: {},
    }

    expect(await locate(tree, "/outer/inner")).toEqual({
      key: "/outer/inner/.git",
      lookup: ["/outer/inner/.git"],
    })
  })

  test("fails when a .git file has no gitdir line", async () => {
    const tree: MemoryTree = {
      directories: ["/broken"],
      files: { "/broken/.git": "not a git pointer\n" },
    }
    const error = await locateError(tree, "/broken")

    expect(error._tag).toBe("RepositoryIdentityError")
    expect(error.message).toContain("/broken/.git")
  })

  test("keeps a non-Git directory as the key and lists its ancestors for lookup", async () => {
    const tree: MemoryTree = {
      directories: ["/data/project", "/data/project/src"],
      files: {},
    }

    expect(await locate(tree, "/data/project/src")).toEqual({
      key: "/data/project/src",
      lookup: ["/data/project/src", "/data/project", "/data", "/"],
    })
  })

  test("picks the first stored ancestor key outside Git", async () => {
    const tree: MemoryTree = {
      directories: ["/data/project", "/data/project/src"],
      files: {},
    }
    const location = await locate(tree, "/data/project/src")

    expect(firstStoredKey(location, new Set(["/data/project"]))).toEqual(
      Option.some("/data/project"),
    )
    expect(firstStoredKey(location, new Set(["/data", "/data/project/src"]))).toEqual(
      Option.some("/data/project/src"),
    )
    expect(firstStoredKey(location, new Set<string>())).toEqual(Option.none())
  })

  test("queries a Git checkout directly and ignores ancestor keys", async () => {
    const tree: MemoryTree = {
      directories: ["/repo", "/repo/.git", "/repo/src"],
      files: { "/repo/.git/HEAD": "ref: refs/heads/main\n" },
    }
    const location = await locate(tree, "/repo/src")

    expect(firstStoredKey(location, new Set(["/repo"]))).toEqual(Option.none())
    expect(firstStoredKey(location, new Set(["/repo/.git"]))).toEqual(Option.some("/repo/.git"))
  })
})
