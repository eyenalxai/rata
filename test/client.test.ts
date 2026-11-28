import type { HttpClientRequest } from "effect/http"

import { describe, expect, test } from "bun:test"
import { Clock, ConfigProvider, Effect, Fiber, Layer, Redacted } from "effect"
import { HttpClient, HttpClientError, HttpClientResponse } from "effect/http"
import { TestClock } from "effect/testing"

import { LinearClient } from "@/api/client"
import { userId } from "@/domain/id"
import { LinearGateway } from "@/linear/gateway"

const jsonResponse = (
  body: unknown,
  status = 200,
  headers: Readonly<Record<string, string>> = {},
): Response =>
  Response.json(body, {
    status,
    headers: { "content-type": "application/json", ...headers },
  })

const httpClientLayer = (http: HttpClient.HttpClient) => {
  const gateway = LinearGateway.layer(() => Effect.succeed(Redacted.make("test-key"))).pipe(
    Layer.provide(Layer.succeed(HttpClient.HttpClient, http)),
  )
  const client = LinearClient.layer.pipe(Layer.provide(gateway))
  return Layer.merge(gateway, client)
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

const stalledBodyLayer = (status: number) =>
  clientLayer(
    () =>
      new Response(new ReadableStream<Uint8Array>(), {
        status,
        headers: { "content-type": "application/json" },
      }),
  )

const failedBodyLayer = () =>
  clientLayer(
    () =>
      new Response(
        new ReadableStream<Uint8Array>({
          start(controller) {
            controller.error(new Error("body failed"))
          },
        }),
        { status: 400 },
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

const runViewerFailure = (layer: Layer.Layer<LinearClient | LinearGateway>) =>
  readViewer.pipe(Effect.provide(layer), Effect.flip, Effect.runPromise)

const runStalledViewer = (layer: Layer.Layer<LinearClient | LinearGateway>) =>
  Effect.gen(function* stallRequest() {
    const client = yield* LinearClient
    const fiber = yield* client.viewer.pipe(Effect.flip, Effect.forkChild)
    yield* TestClock.adjust("30 seconds")
    return yield* Fiber.join(fiber)
  }).pipe(
    Effect.provide(
      Layer.mergeAll(
        layer,
        TestClock.layer(),
        ConfigProvider.layer(ConfigProvider.fromEnvRecord({ RATA_LINEAR_TIMEOUT: "5 seconds" })),
      ),
    ),
    Effect.runPromise,
  )

describe("LinearClient", () => {
  test("maps 401 to LinearAuthError without a retry and keeps the server message", async () => {
    let calls = 0
    const error = await runViewerFailure(
      clientLayer(() => {
        calls += 1
        return jsonResponse({ errors: [{ message: "bad key" }] }, 401)
      }),
    )
    expect(error._tag).toBe("LinearAuthError")
    if (error._tag === "LinearAuthError") {
      expect(error.message).toContain("bad key")
    }
    expect(calls).toBe(1)
  })

  test("keeps the server message from a 4xx body", async () => {
    const error = await runViewerFailure(
      clientLayer(() => jsonResponse({ errors: [{ message: "Field 'x' is undefined" }] }, 400)),
    )
    expect(error._tag).toBe("LinearGraphQLError")
    if (error._tag === "LinearGraphQLError") {
      expect(error.message).toBe("Field 'x' is undefined")
      expect(error.details).toEqual(["Field 'x' is undefined"])
    }
  })

  test("keeps an undecodable 4xx body in the cause", async () => {
    const error = await runViewerFailure(
      clientLayer(() => new Response("Bad request: no query", { status: 400 })),
    )
    expect(error._tag).toBe("LinearGraphQLError")
    if (error._tag === "LinearGraphQLError") {
      expect(error.message).toBe("Linear returned HTTP 400.")
      expect(error.cause).toBe("Bad request: no query")
    }
  })

  test("keeps a body read failure in the cause", async () => {
    const error = await runViewerFailure(failedBodyLayer())
    expect(error._tag).toBe("LinearGraphQLError")
    if (error._tag === "LinearGraphQLError") {
      expect(error.message).toBe("Linear returned HTTP 400.")
      expect(error.cause).toMatchObject({ _tag: "HttpClientError" })
    }
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
      expect(error.message).toContain("slow down")
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

  test("keeps the messages from an errors-only response", async () => {
    const error = await runViewerFailure(
      clientLayer(() => jsonResponse({ errors: [{ message: "A" }, { message: "B" }] })),
    )
    expect(error._tag).toBe("LinearGraphQLError")
    if (error._tag === "LinearGraphQLError") {
      expect(error.message).toBe("A; B")
      expect(error.details).toEqual(["A", "B"])
    }
  })

  test("reads errors before decoding data", async () => {
    const error = await runViewerFailure(
      clientLayer(() =>
        jsonResponse({
          data: { viewer: { id: 42 } },
          errors: [{ message: "A" }, { message: "B" }],
        }),
      ),
    )
    expect(error._tag).toBe("LinearGraphQLError")
    if (error._tag === "LinearGraphQLError") {
      expect(error.message).toBe("A; B")
      expect(error.details).toEqual(["A", "B"])
    }
  })

  test("decodes a successful response", async () => {
    const viewer = await readViewer.pipe(
      Effect.provide(
        clientLayer(() =>
          jsonResponse({
            data: {
              viewer: {
                id: "u1",
                name: "Ada",
                displayName: "ada",
                email: "ada@example.com",
                active: true,
                admin: false,
                organization: { id: "o1", name: "Org", urlKey: "org" },
              },
            },
          }),
        ),
      ),
      Effect.runPromise,
    )
    expect(viewer.id).toBe(userId("u1"))
    expect(viewer.displayName).toBe("ada")
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

  test("fails with LinearNetworkError when the request stalls", async () => {
    const error = await runStalledViewer(httpClientLayer(HttpClient.make(() => Effect.never)))
    expect(error._tag).toBe("LinearNetworkError")
    if (error._tag === "LinearNetworkError") {
      expect(error.message).toContain("did not respond")
    }
  })

  test("fails with LinearNetworkError when an error body stalls", async () => {
    const error = await runStalledViewer(stalledBodyLayer(400))
    expect(error._tag).toBe("LinearNetworkError")
    if (error._tag === "LinearNetworkError") {
      expect(error.message).toContain("did not respond")
    }
  })

  test("fails with LinearNetworkError when a success body stalls", async () => {
    const error = await runStalledViewer(stalledBodyLayer(200))
    expect(error._tag).toBe("LinearNetworkError")
    if (error._tag === "LinearNetworkError") {
      expect(error.message).toContain("did not respond")
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
