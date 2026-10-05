import type { HttpClientRequest } from "effect/http"

import { describe, expect, test } from "bun:test"
import { ConfigProvider, Effect, FileSystem, Layer, Path } from "effect"
import { HttpClient, HttpClientResponse } from "effect/http"

import { LinearClient } from "@/api/client"
import { Auth } from "@/config/auth"

const viewer = {
  id: "u1",
  name: "Ada",
  displayName: "ada",
  email: "ada@example.com",
  active: true,
  admin: false,
}

const jsonResponse = (body: unknown, status = 200): Response =>
  Response.json(body, {
    status,
    headers: { "content-type": "application/json" },
  })

const configLayer = () =>
  ConfigProvider.layer(
    ConfigProvider.fromEnvRecord({ HOME: "/home/test", LINEAR_API_KEY: "test-key" }),
  )

const clientLayer = (handler: (request: HttpClientRequest.HttpClientRequest) => Response) => {
  const http = HttpClient.make((request) =>
    Effect.succeed(HttpClientResponse.fromWeb(request, handler(request))),
  )
  const auth = Auth.layer.pipe(Layer.provide(Layer.mergeAll(FileSystem.layerNoop({}), Path.layer)))
  return LinearClient.layer.pipe(
    Layer.provide(Layer.mergeAll(auth, Layer.succeed(HttpClient.HttpClient, http))),
  )
}

const runViewer = (handler: (request: HttpClientRequest.HttpClientRequest) => Response) =>
  Effect.gen(function* readViewer() {
    const client = yield* LinearClient
    return yield* client.viewer
  }).pipe(Effect.provide(Layer.mergeAll(clientLayer(handler), configLayer())), Effect.runPromise)

const runViewerFailure = (handler: (request: HttpClientRequest.HttpClientRequest) => Response) =>
  Effect.gen(function* readViewer() {
    const client = yield* LinearClient
    return yield* client.viewer
  }).pipe(
    Effect.provide(Layer.mergeAll(clientLayer(handler), configLayer())),
    Effect.flip,
    Effect.runPromise,
  )

describe("LinearClient", () => {
  test("decodes the viewer", async () => {
    const result = await runViewer(() => jsonResponse({ data: { viewer } }))
    expect(result.email).toBe("ada@example.com")
  })

  test("sends the API key in the authorization header", async () => {
    const seen: (string | undefined)[] = []
    await runViewer((request) => {
      seen.push(request.headers.authorization)
      return jsonResponse({ data: { viewer } })
    })
    expect(seen).toEqual(["test-key"])
  })

  test("maps 401 to LinearAuthError", async () => {
    const error = await runViewerFailure(() =>
      jsonResponse({ errors: [{ message: "bad key" }] }, 401),
    )
    expect(error._tag).toBe("LinearAuthError")
  })

  test("maps GraphQL errors to LinearGraphQLError", async () => {
    const error = await runViewerFailure(() =>
      jsonResponse({ data: null, errors: [{ message: "A" }, { message: "B" }] }),
    )
    expect(error._tag).toBe("LinearGraphQLError")
    if (error._tag === "LinearGraphQLError") {
      expect(error.details).toEqual(["A", "B"])
    }
  })

  test("maps 500 to LinearNetworkError after retries", async () => {
    let calls = 0
    const error = await runViewerFailure(() => {
      calls += 1
      return jsonResponse({ errors: [{ message: "boom" }] }, 500)
    })
    expect(error._tag).toBe("LinearNetworkError")
    expect(calls).toBe(4)
  })
})
