import type { Handler } from "@test/fake-linear-model"

import { apiLayer } from "@test/fake-linear"
import { readRequest } from "@test/fake-linear-model"
import { describe, expect, test } from "bun:test"
import { Effect, Result } from "effect"

import { collectWorkspaces } from "@/cli/workspace"

const authPath = "/home/test/.config/rata/auth.json"

const authFile = JSON.stringify({
  default: "good",
  workspaces: { good: { apiKey: "good-key" }, bad: { apiKey: "bad-key" } },
})

const viewer = {
  id: "user-1",
  name: "Good User",
  displayName: "good",
  email: "good@example.com",
  active: true,
  admin: false,
  organization: { id: "org-1", name: "Good Org", urlKey: "good" },
}

const handler: Handler = (request) => {
  const { query } = readRequest(request)
  if (!query.includes("Viewer")) {
    throw new Error(`Unexpected query: ${query}`)
  }
  if (request.headers.authorization === "good-key") {
    return Response.json({ data: { viewer } })
  }
  return Response.json({ errors: [{ message: "Authentication required" }] }, { status: 401 })
}

const layer = apiLayer(handler, { files: new Map([[authPath, authFile]]) })

describe("workspace list", () => {
  test("keeps the other profiles when one key is rejected", async () => {
    const entries = await collectWorkspaces().pipe(Effect.provide(layer), Effect.runPromise)
    expect(entries.map((entry) => entry.name)).toEqual(["good", "bad"])
    const good = entries.find((entry) => entry.name === "good")
    const bad = entries.find((entry) => entry.name === "bad")
    if (good === undefined || bad === undefined) {
      throw new Error("Expected both stored profiles.")
    }
    expect(Result.isSuccess(good.result)).toBe(true)
    expect(Result.isSuccess(good.result) ? good.result.success.name : undefined).toBe("Good User")
    expect(Result.isFailure(bad.result)).toBe(true)
  })
})
