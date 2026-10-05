import { Context, Effect, Layer, Redacted, Schedule, Schema } from "effect"
import { HttpClient, HttpClientRequest, HttpClientResponse } from "effect/http"

import type { LinearApiError } from "@/api/errors"

import {
  isRetryableLinearError,
  LinearAuthError,
  LinearGraphQLError,
  LinearNetworkError,
  LinearRateLimitError,
} from "@/api/errors"
import { Auth } from "@/config/auth"

const endpoint = "https://api.linear.app/graphql"

const GraphQLErrorPayload = Schema.Struct({ message: Schema.String })

const Viewer = Schema.Struct({
  id: Schema.String,
  name: Schema.String,
  displayName: Schema.String,
  email: Schema.String,
  active: Schema.Boolean,
  admin: Schema.Boolean,
})

type Viewer = typeof Viewer.Type

const viewerQuery = `query Viewer {
  viewer {
    id
    name
    displayName
    email
    active
    admin
  }
}`

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
  readonly viewer: Effect.Effect<Viewer, LinearApiError>
}

const retryPolicy = Schedule.exponential("200 millis").pipe(Schedule.jittered)

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

class LinearClient extends Context.Service<LinearClient, LinearClientShape>()(
  "rata-cli/api/client/LinearClient",
) {
  static readonly layer = Layer.effect(
    LinearClient,
    Effect.gen(function* linearClientLayer() {
      const auth = yield* Auth
      const http = yield* HttpClient.HttpClient

      const execute = <S extends ClientSchema>(
        query: string,
        variables: Record<string, unknown>,
        data: S,
      ): Effect.Effect<S["Type"], LinearApiError> =>
        Effect.gen(function* executeQuery() {
          const resolved = yield* auth.require.pipe(
            Effect.mapError((error) => new LinearAuthError({ message: error.message })),
          )
          const request = HttpClientRequest.post(endpoint).pipe(
            HttpClientRequest.setHeaders({
              authorization: Redacted.value(resolved.key),
              "content-type": "application/json",
            }),
            HttpClientRequest.bodyJsonUnsafe({ query, variables }),
          )

          const send = Effect.gen(function* sendRequest() {
            const response = yield* http
              .execute(request)
              .pipe(Effect.mapError((cause) => new LinearNetworkError({ message: cause.message })))

            if (response.status === 401 || response.status === 403) {
              return yield* new LinearAuthError({
                message: "Linear rejected the API key.",
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
              return yield* new LinearNetworkError({
                message: `Linear returned HTTP ${response.status}.`,
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

          const response = yield* send.pipe(
            Effect.retry({ while: isRetryableLinearError, times: 3, schedule: retryPolicy }),
          )

          const envelope = yield* HttpClientResponse.schemaBodyJson(responseEnvelope(data))(
            response,
          ).pipe(
            Effect.mapError(
              () =>
                new LinearGraphQLError({
                  message: "Linear returned an unexpected response body.",
                  details: [],
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

      const viewer = execute(viewerQuery, {}, Schema.Struct({ viewer: Viewer })).pipe(
        Effect.map((data) => data.viewer),
      )

      return LinearClient.of({ execute, viewer })
    }),
  )
}

export { LinearClient, Viewer, viewerQuery }
