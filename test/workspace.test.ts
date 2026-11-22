import type { MemorySeed } from "@test/fake-linear/gateway/model"

import { memoryApiLayer } from "@test/fake-linear/memory-layer"
import { describe, expect, test } from "bun:test"
import { Effect, Option, Result, Schema } from "effect"

import { collectWorkspaces } from "@/cli/workspace"
import { Viewer } from "@/linear/decode/viewer"

const viewer = Option.getOrThrow(
  Schema.decodeUnknownOption(Viewer)({
    id: "user-1",
    name: "Good User",
    displayName: "good",
    email: "good@example.com",
    active: true,
    admin: false,
    organization: { id: "org-1", name: "Good Org", urlKey: "good" },
  }),
)

const seed: MemorySeed = {
  viewer,
  teams: [],
  labels: [],
  rejectedKeys: ["bad-key"],
}

const layer = memoryApiLayer(seed, {
  profiles: [
    { name: "good", apiKey: "good-key", isDefault: true },
    { name: "bad", apiKey: "bad-key" },
  ],
})

describe("workspace list", () => {
  test("keeps the other profiles when one key is rejected", async () => {
    const entries = await collectWorkspaces().pipe(Effect.provide(layer), Effect.runPromise)
    expect(entries.map((entry) => entry.name)).toEqual(["bad", "good"])
    const good = entries.find((entry) => entry.name === "good")
    const bad = entries.find((entry) => entry.name === "bad")
    if (good === undefined || bad === undefined) {
      throw new Error("Expected both stored profiles.")
    }
    expect(Result.isSuccess(good.result)).toBe(true)
    expect(Result.isSuccess(good.result) ? good.result.success.name : undefined).toBe("Good User")
    expect(Result.isFailure(bad.result)).toBe(true)
    expect(Result.isFailure(bad.result) ? bad.result.failure._tag : undefined).toBe(
      "LinearAuthError",
    )
  })
})
