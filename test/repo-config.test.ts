import { describe, expect, test } from "bun:test"
import { Effect, FileSystem, Layer, Path } from "effect"

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

const configPath = () => `${process.cwd()}/.rata.json`

describe("RepoConfigService", () => {
  test("fails on invalid JSON", async () => {
    const error = await Effect.gen(function* readRepoConfig() {
      const config = yield* RepoConfigService
      return yield* config.read
    }).pipe(
      Effect.provide(configLayer(new Map([[configPath(), "not json"]]))),
      Effect.flip,
      Effect.runPromise,
    )
    expect(error._tag).toBe("RepoConfigError")
  })
})
