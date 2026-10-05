import { describe, expect, test } from "bun:test"
import { Effect, FileSystem, Layer, Option, Path } from "effect"

import { RepoConfigService } from "@/config/repo"

const configLayer = (files: Map<string, string>) =>
  RepoConfigService.layer.pipe(
    Layer.provide(
      Layer.mergeAll(
        FileSystem.layerNoop({
          exists: (file) => Effect.succeed(files.has(file)),
          readFileString: (file) => Effect.succeed(files.get(file) ?? ""),
        }),
        Path.layer,
      ),
    ),
  )

const runRead = (content?: string) => {
  const files = new Map<string, string>()
  if (content !== undefined) {
    files.set(`${process.cwd()}/.rata.json`, content)
  }
  return Effect.gen(function* readRepoConfig() {
    const config = yield* RepoConfigService
    return yield* config.read
  }).pipe(Effect.provide(configLayer(files)), Effect.runPromise)
}

describe("RepoConfigService", () => {
  test("reads team and project", async () => {
    const config = await runRead(JSON.stringify({ team: "PER", project: "rata" }))
    expect(Option.isSome(config)).toBe(true)
    if (Option.isSome(config)) {
      expect(config.value.team).toBe("PER")
      expect(config.value.project).toBe("rata")
    }
  })

  test("reads a partial config", async () => {
    const config = await runRead(JSON.stringify({ team: "PER" }))
    expect(Option.isSome(config)).toBe(true)
    if (Option.isSome(config)) {
      expect(config.value.team).toBe("PER")
      expect(config.value.project).toBeUndefined()
    }
  })

  test("returns none without a file", async () => {
    const config = await runRead()
    expect(Option.isNone(config)).toBe(true)
  })

  test("fails on invalid JSON", async () => {
    const exit = await Effect.gen(function* readRepoConfig() {
      const config = yield* RepoConfigService
      return yield* config.read
    }).pipe(
      Effect.provide(configLayer(new Map([[`${process.cwd()}/.rata.json`, "not json"]]))),
      Effect.flip,
      Effect.runPromise,
    )
    expect(exit._tag).toBe("RepoConfigError")
  })
})
