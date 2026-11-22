import type { HttpClient } from "effect/http"

import { Duration, Effect, Redacted, Schedule, Schema } from "effect"
import { HttpClientRequest, HttpClientResponse } from "effect/http"

import type { LinearApiError } from "@/linear/errors"

import { Viewer } from "@/linear/decode/viewer"
import { viewerQuery } from "@/linear/documents/viewer"
import {
  isRetryableLinearError,
  LinearAuthError,
  LinearGraphQLError,
  LinearNetworkError,
  LinearRateLimitError,
} from "@/linear/errors"

const endpoint = "https://api.linear.app/graphql"

const GraphQLErrorPayload = Schema.Struct({ message: Schema.String })

const responseEnvelope = <S extends Schema.Constraint>(data: S) =>
  Schema.Struct({
    data: Schema.NullOr(data),
    errors: Schema.optional(Schema.Array(GraphQLErrorPayload)),
  })

type ClientSchema = Schema.Constraint & { readonly DecodingServices: never }

type LinearClientShape = {
  readonly execute: <S extends ClientSchema>(
    query: string,
    variables: Record<string, unknown>,
    data: S,
  ) => Effect.Effect<S["Type"], LinearApiError>
  readonly executeWithKey: <S extends ClientSchema>(
    apiKey: Redacted.Redacted,
    query: string,
    variables: Record<string, unknown>,
    data: S,
  ) => Effect.Effect<S["Type"], LinearApiError>
  readonly withKey: (apiKey: Redacted.Redacted) => LinearClientShape
  readonly viewer: Effect.Effect<Viewer, LinearApiError>
  readonly viewerWithKey: (apiKey: Redacted.Redacted) => Effect.Effect<Viewer, LinearApiError>
}

const maxRetries = 3

const retryPolicy: Schedule.Schedule<Duration.Duration, LinearApiError> = Schedule.exponential(
  "200 millis",
).pipe(
  Schedule.jittered,
  Schedule.modifyDelay((metadata) =>
    metadata.input._tag === "LinearRateLimitError" && metadata.input.retryAfterSeconds !== undefined
      ? Effect.succeed(Duration.seconds(metadata.input.retryAfterSeconds))
      : Effect.succeed(metadata.duration),
  ),
)

const parseRetryAfter = (
  headers: Readonly<Record<string, string | undefined>> | undefined,
): number | undefined => {
  const value = headers?.["retry-after"]
  if (value === undefined) {
    return undefined
  }
  const seconds = Number(value)
  return Number.isFinite(seconds) ? seconds : undefined
}

const makeSend = (http: HttpClient.HttpClient) =>
  Effect.fn("LinearClient.send")(function* sendRequest(
    request: HttpClientRequest.HttpClientRequest,
  ) {
    const response = yield* http
      .execute(request)
      .pipe(Effect.mapError((cause) => new LinearNetworkError({ message: cause.message, cause })))

    if (response.status === 401 || response.status === 403) {
      return yield* new LinearAuthError({
        message:
          response.status === 403 ? "Linear forbade this request." : "Linear rejected the API key.",
        status: response.status,
      })
    }
    if (response.status === 429) {
      return yield* new LinearRateLimitError({
        message: "Linear rate limit reached.",
        retryAfterSeconds: parseRetryAfter(response.headers),
      })
    }
    if (response.status >= 500) {
      const body = yield* response.text.pipe(Effect.orElseSucceed(() => ""))
      return yield* new LinearNetworkError({
        message: `Linear returned HTTP ${response.status}.`,
        ...(body.trim() === "" ? {} : { cause: body }),
      })
    }
    if (response.status >= 400) {
      return yield* new LinearGraphQLError({
        message: `Linear returned HTTP ${response.status}.`,
        details: [],
      })
    }
    return response
  })

const makeClient = (
  http: HttpClient.HttpClient,
  key: () => Effect.Effect<Redacted.Redacted, LinearApiError>,
): LinearClientShape => {
  const send = makeSend(http)

  const executeWithKey = Effect.fn("LinearClient.executeWithKey")(function* executeQueryWithKey<
    S extends ClientSchema,
  >(
    apiKey: Redacted.Redacted,
    query: string,
    variables: Record<string, unknown>,
    data: S,
  ): Effect.fn.Return<S["Type"], LinearApiError> {
    const request = HttpClientRequest.post(endpoint).pipe(
      HttpClientRequest.setHeaders({
        authorization: Redacted.value(apiKey),
        "content-type": "application/json",
      }),
      HttpClientRequest.bodyJsonUnsafe({ query, variables }),
    )

    const response = yield* send(request).pipe(
      Effect.retry({ while: isRetryableLinearError, times: maxRetries, schedule: retryPolicy }),
    )

    const envelope = yield* HttpClientResponse.schemaBodyJson(responseEnvelope(data))(
      response,
    ).pipe(
      Effect.mapError(
        (cause) =>
          new LinearGraphQLError({
            message: "Linear returned an unexpected response body.",
            details: [],
            cause,
          }),
      ),
    )
    if (envelope.errors !== undefined && envelope.errors.length > 0) {
      const details = envelope.errors.map((error) => error.message)
      return yield* new LinearGraphQLError({ message: details.join("; "), details })
    }
    if (envelope.data === null) {
      return yield* new LinearGraphQLError({
        message: "Linear returned no data.",
        details: [],
      })
    }
    return envelope.data
  })

  const execute = Effect.fn("LinearClient.execute")(function* executeQuery<S extends ClientSchema>(
    query: string,
    variables: Record<string, unknown>,
    data: S,
  ): Effect.fn.Return<S["Type"], LinearApiError> {
    const apiKey = yield* key()
    return yield* executeWithKey(apiKey, query, variables, data)
  })

  const viewer = execute(viewerQuery, {}, Schema.Struct({ viewer: Viewer })).pipe(
    Effect.map((data) => data.viewer),
    Effect.withSpan("LinearClient.viewer"),
  )

  const withKey = (apiKey: Redacted.Redacted): LinearClientShape =>
    makeClient(http, () => Effect.succeed(apiKey))

  const viewerWithKey = (apiKey: Redacted.Redacted) =>
    executeWithKey(apiKey, viewerQuery, {}, Schema.Struct({ viewer: Viewer })).pipe(
      Effect.map((data) => data.viewer),
      Effect.withSpan("LinearClient.viewerWithKey"),
    )

  return { execute, executeWithKey, viewer, viewerWithKey, withKey }
}

export { type LinearClientShape, makeClient }
