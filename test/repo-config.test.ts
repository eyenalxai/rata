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
          writeFileString: (file, data) => {
            files.set(file, data)
            return Effect.void
          },
        }),
        Path.layer,
      ),
    ),
  )

const configPath = () => `${process.cwd()}/.rata.json`

const runRead = (files: Map<string, string>) =>
  Effect.gen(function* readRepoConfig() {
    const config = yield* RepoConfigService
    return yield* config.read
  }).pipe(Effect.provide(configLayer(files)), Effect.runPromise)

const runWrite = (files: Map<string, string>, config: { team?: string; project?: string }) =>
  Effect.gen(function* writeRepoConfig() {
    const repoConfig = yield* RepoConfigService
    yield* repoConfig.write(config)
  }).pipe(Effect.provide(configLayer(files)), Effect.runPromise)

describe("RepoConfigService", () => {
  test("reads team and project", async () => {
    const files = new Map([[configPath(), JSON.stringify({ team: "PER", project: "rata" })]])
    const config = await runRead(files)
    expect(Option.isSome(config)).toBe(true)
    if (Option.isSome(config)) {
      expect(config.value.team).toBe("PER")
      expect(config.value.project).toBe("rata")
    }
  })

  test("reads a partial config", async () => {
    const files = new Map([[configPath(), JSON.stringify({ team: "PER" })]])
    const config = await runRead(files)
    expect(Option.isSome(config)).toBe(true)
    if (Option.isSome(config)) {
      expect(config.value.team).toBe("PER")
      expect(config.value.project).toBeUndefined()
    }
  })

  test("returns none without a file", async () => {
    const config = await runRead(new Map())
    expect(Option.isNone(config)).toBe(true)
  })

  test("fails on invalid JSON", async () => {
    const exit = await Effect.gen(function* readRepoConfig() {
      const config = yield* RepoConfigService
      return yield* config.read
    }).pipe(
      Effect.provide(configLayer(new Map([[configPath(), "not json"]]))),
      Effect.flip,
      Effect.runPromise,
    )
    expect(exit._tag).toBe("RepoConfigError")
  })

  test("writes a config that reads back", async () => {
    const files = new Map<string, string>()
    await runWrite(files, { team: "PER", project: "rata" })
    expect(files.has(configPath())).toBe(true)

    const config = await runRead(files)
    expect(Option.isSome(config)).toBe(true)
    if (Option.isSome(config)) {
      expect(config.value.team).toBe("PER")
      expect(config.value.project).toBe("rata")
    }
  })
})
