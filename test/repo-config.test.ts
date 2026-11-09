import {
  emptyDefaults,
  nonGitTree,
  repoTree,
  withRepoConfig,
  worktreeTree,
} from "@test/repo-config/harness"
import { describe, expect, test } from "bun:test"
import { Effect, Option } from "effect"

import { RepoConfigService } from "@/config/repo"
import { Database } from "@/db/database"
import { repositories } from "@/db/schema"

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
      { key: "/repo/.git", team: "RAT", project: "rata", workspace: null, ...emptyDefaults },
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

  test("writes and reads one link across a worktree and the main checkout", async () => {
    const result = await withRepoConfig(
      worktreeTree,
      [],
      Effect.gen(function* readWorktree() {
        const service = yield* RepoConfigService
        yield* service.write("/topic/src", { team: "RAT", workspace: "work" })
        const fromWorktree = yield* service.read("/topic/src")
        const fromMain = yield* service.read("/repo")
        return { fromMain, fromWorktree }
      }),
    )

    expect(result.fromMain).toEqual(Option.some({ team: "RAT", workspace: "work" }))
    expect(result.fromWorktree).toEqual(Option.some({ team: "RAT", workspace: "work" }))
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
