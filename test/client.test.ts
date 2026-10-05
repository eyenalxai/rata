import type { HttpClientRequest } from "effect/http"

import { describe, expect, test } from "bun:test"
import { ConfigProvider, Clock, Effect, Fiber, FileSystem, Layer, Path } from "effect"
import { HttpClient, HttpClientError, HttpClientResponse } from "effect/http"
import { TestClock } from "effect/testing"

import { LinearClient } from "@/api/client"
import { Auth } from "@/config/auth"

const viewer = {
  id: "u1",
  name: "Ada",
  displayName: "ada",
  email: "ada@example.com",
  active: true,
  admin: false,
  organization: { id: "o1", name: "Acme", urlKey: "acme" },
}

const jsonResponse = (
  body: unknown,
  status = 200,
  headers: Readonly<Record<string, string>> = {},
): Response =>
  Response.json(body, {
    status,
    headers: { "content-type": "application/json", ...headers },
  })

const configLayer = () =>
  ConfigProvider.layer(
    ConfigProvider.fromEnvRecord({ HOME: "/home/test", LINEAR_API_KEY: "test-key" }),
  )

const httpClientLayer = (http: HttpClient.HttpClient) => {
  const auth = Auth.layer.pipe(Layer.provide(Layer.mergeAll(FileSystem.layerNoop({}), Path.layer)))
  return LinearClient.layer.pipe(
    Layer.provide(Layer.mergeAll(auth, Layer.succeed(HttpClient.HttpClient, http))),
  )
}

const clientLayer = (handler: (request: HttpClientRequest.HttpClientRequest) => Response) =>
  httpClientLayer(
    HttpClient.make((request) =>
      Effect.succeed(HttpClientResponse.fromWeb(request, handler(request))),
    ),
  )

const transportFailureLayer = () =>
  httpClientLayer(
    HttpClient.make((request) =>
      Effect.fail(
        new HttpClientError.HttpClientError({
          reason: new HttpClientError.TransportError({
            request,
            cause: new Error("socket closed"),
          }),
        }),
      ),
    ),
  )

const clockedClientLayer = (
  handler: (request: HttpClientRequest.HttpClientRequest) => Response,
  times: number[],
) =>
  httpClientLayer(
    HttpClient.make((request) =>
      Effect.gen(function* recordRequest() {
        times.push(yield* Clock.currentTimeMillis)
        return HttpClientResponse.fromWeb(request, handler(request))
      }),
    ),
  )

const readViewer = Effect.gen(function* readViewer() {
  const client = yield* LinearClient
  return yield* client.viewer
})

const runViewer = (layer: Layer.Layer<LinearClient>) =>
  readViewer.pipe(Effect.provide(Layer.mergeAll(layer, configLayer())), Effect.runPromise)

const runViewerFailure = (layer: Layer.Layer<LinearClient>) =>
  readViewer.pipe(
    Effect.provide(Layer.mergeAll(layer, configLayer())),
    Effect.flip,
    Effect.runPromise,
  )

describe("LinearClient", () => {
  test("decodes the viewer with its workspace", async () => {
    const result = await runViewer(clientLayer(() => jsonResponse({ data: { viewer } })))
    expect(result.email).toBe("ada@example.com")
    expect(result.organization.urlKey).toBe("acme")
  })

  test("sends the API key in the authorization header", async () => {
    const seen: (string | undefined)[] = []
    await runViewer(
      clientLayer((request) => {
        seen.push(request.headers.authorization)
        return jsonResponse({ data: { viewer } })
      }),
    )
    expect(seen).toEqual(["test-key"])
  })

  test("maps 401 to LinearAuthError without a retry", async () => {
    let calls = 0
    const error = await runViewerFailure(
      clientLayer(() => {
        calls += 1
        return jsonResponse({ errors: [{ message: "bad key" }] }, 401)
      }),
    )
    expect(error._tag).toBe("LinearAuthError")
    expect(calls).toBe(1)
  })

  test("maps 429 to LinearRateLimitError with Retry-After", async () => {
    let calls = 0
    const error = await runViewerFailure(
      clientLayer(() => {
        calls += 1
        return jsonResponse({ errors: [{ message: "slow down" }] }, 429, { "retry-after": "0" })
      }),
    )
    expect(error._tag).toBe("LinearRateLimitError")
    if (error._tag === "LinearRateLimitError") {
      expect(error.retryAfterSeconds).toBe(0)
    }
    expect(calls).toBe(4)
  })

  test("waits Retry-After before the next attempt", async () => {
    const times: number[] = []
    const error = await Effect.gen(function* waitForRetry() {
      const client = yield* LinearClient
      const fiber = yield* client.viewer.pipe(Effect.flip, Effect.forkChild)
      yield* TestClock.adjust("10 seconds")
      return yield* Fiber.join(fiber)
    }).pipe(
      Effect.provide(
        Layer.mergeAll(
          clockedClientLayer(
            () => jsonResponse({ errors: [{ message: "slow down" }] }, 429, { "retry-after": "2" }),
            times,
          ),
          configLayer(),
          TestClock.layer(),
        ),
      ),
      Effect.runPromise,
    )
    expect(error._tag).toBe("LinearRateLimitError")
    expect(times).toEqual([0, 2000, 4000, 6000])
  })

  test("maps GraphQL errors to LinearGraphQLError", async () => {
    const error = await runViewerFailure(
      clientLayer(() => jsonResponse({ data: null, errors: [{ message: "A" }, { message: "B" }] })),
    )
    expect(error._tag).toBe("LinearGraphQLError")
    if (error._tag === "LinearGraphQLError") {
      expect(error.details).toEqual(["A", "B"])
    }
  })

  test("maps a decode failure to LinearGraphQLError with its cause", async () => {
    const error = await runViewerFailure(
      clientLayer(() => jsonResponse({ data: { viewer: { id: "u1" } } })),
    )
    expect(error._tag).toBe("LinearGraphQLError")
    if (error._tag === "LinearGraphQLError") {
      expect(error.cause).toBeDefined()
    }
  })

  test("maps a transport failure to LinearNetworkError with its cause", async () => {
    const error = await runViewerFailure(transportFailureLayer())
    expect(error._tag).toBe("LinearNetworkError")
    if (error._tag === "LinearNetworkError") {
      expect(error.cause).toBeDefined()
      expect(error.message).toContain("Transport")
    }
  })

  test("maps 500 to LinearNetworkError after retries", async () => {
    let calls = 0
    const error = await runViewerFailure(
      clientLayer(() => {
        calls += 1
        return jsonResponse({ errors: [{ message: "boom" }] }, 500)
      }),
    )
    expect(error._tag).toBe("LinearNetworkError")
    expect(calls).toBe(4)
    if (error._tag === "LinearNetworkError") {
      expect(error.cause).toBeDefined()
    }
  })
})
