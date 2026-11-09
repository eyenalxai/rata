import type { MemoryTree } from "@test/memory-file-system"

import { recordingConsoleWithErrors } from "@test/recording-console"
import { emptyDefaults, nonGitTree, withRepoConfig } from "@test/repo-config/harness"
import { describe, expect, test } from "bun:test"
import { Effect, Option } from "effect"

import { RepoConfigService } from "@/config/repo"
import { Database } from "@/db/database"
import { repositories } from "@/db/schema"

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
      { key: "/repo/.git", team: "RAT", project: null, workspace: "work", ...emptyDefaults },
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

  test("keeps the imported config when the legacy file cannot be removed", async () => {
    const tree: MemoryTree = {
      directories: ["/repo", "/repo/.git"],
      files: new Map([["/repo/.rata.json", JSON.stringify({ team: "RAT", project: "rata" })]]),
      removeFailure: "PermissionDenied",
    }
    const stdout: string[] = []
    const stderr: string[] = []
    const result = await withRepoConfig(
      tree,
      [],
      Effect.gen(function* failedRemove() {
        const service = yield* RepoConfigService
        const config = yield* service.read("/repo")
        return { config }
      }),
      recordingConsoleWithErrors(stdout, stderr),
    )

    expect(result.config).toEqual(Option.some({ team: "RAT", project: "rata" }))
    expect(tree.files.has("/repo/.rata.json")).toBe(true)
    expect(stdout).toEqual([])
    expect(stderr).toEqual([
      "warning: Could not remove the legacy repository config at /repo/.rata.json. Delete it to finish the migration.",
      "Migrated repository config from /repo/.rata.json.",
    ])
  })

  test("treats a legacy file that is already gone as a successful cleanup", async () => {
    const tree: MemoryTree = {
      directories: ["/repo", "/repo/.git"],
      files: new Map([["/repo/.rata.json", JSON.stringify({ team: "RAT" })]]),
      removeFailure: "NotFound",
    }
    const stdout: string[] = []
    const stderr: string[] = []
    const result = await withRepoConfig(
      tree,
      [],
      Effect.gen(function* missingCleanup() {
        const service = yield* RepoConfigService
        return { config: yield* service.read("/repo") }
      }),
      recordingConsoleWithErrors(stdout, stderr),
    )

    expect(result.config).toEqual(Option.some({ team: "RAT" }))
    expect(stdout).toEqual([])
    expect(stderr).toEqual(["Migrated repository config from /repo/.rata.json."])
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
