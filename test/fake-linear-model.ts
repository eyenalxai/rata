import type { HttpClientRequest } from "effect/http"

import { Option, Schema } from "effect"

const GraphQLRequest = Schema.Struct({
  query: Schema.String,
  variables: Schema.Record(Schema.String, Schema.Unknown),
})

type GraphQLRequest = typeof GraphQLRequest.Type & { readonly authorization?: string }

type Handler = (request: HttpClientRequest.HttpClientRequest) => Response

type FakeTeam = {
  readonly id: string
  readonly key: string
  readonly name: string
  readonly timezone: string
}

type FakeLabel = {
  readonly id: string
  readonly name: string
  readonly color: string
  readonly teamId: string | null
}

type FakeProject = {
  readonly id: string
  readonly name: string
  readonly progress: number
  readonly status: { readonly name: string }
  readonly trashed?: boolean
}

type FakeViewer = {
  readonly id: string
  readonly name: string
  readonly displayName: string
  readonly email: string
  readonly active: boolean
  readonly admin: boolean
  readonly organization: {
    readonly id: string
    readonly name: string
    readonly urlKey: string
  }
}

type FakeWorkspace = {
  readonly viewer: FakeViewer
  readonly teams: readonly FakeTeam[]
  readonly labels?: readonly FakeLabel[]
}

const defaultEnv = { HOME: "/home/test", LINEAR_API_KEY: "test-key" }

const defaultViewer: FakeViewer = {
  id: "user-1",
  name: "Ada",
  displayName: "ada",
  email: "ada@example.com",
  active: true,
  admin: true,
  organization: { id: "org-1", name: "Acme", urlKey: "acme" },
}

const jsonResponse = (body: unknown, status = 200): Response =>
  Response.json(body, { status, headers: { "content-type": "application/json" } })

const readRequest = (request: HttpClientRequest.HttpClientRequest): GraphQLRequest => {
  const body = request.body
  if (body._tag !== "Uint8Array") {
    throw new Error("Expected a byte-array request body.")
  }
  const parsed: unknown = JSON.parse(new TextDecoder().decode(body.body))
  const decoded = Schema.decodeUnknownOption(GraphQLRequest)(parsed)
  if (Option.isNone(decoded)) {
    throw new Error("Expected a GraphQL request body.")
  }
  return decoded.value
}

const recordSchema = Schema.Record(Schema.String, Schema.Unknown)

const paginate = <A extends { readonly id: string }>(
  nodes: readonly A[],
  variables: Record<string, unknown>,
): {
  readonly nodes: readonly A[]
  readonly pageInfo: { readonly hasNextPage: boolean; readonly endCursor: string | null }
} => {
  const first = typeof variables.first === "number" ? variables.first : 50
  const after = typeof variables.after === "string" ? variables.after : null
  const start = after === null ? 0 : nodes.findIndex((node) => node.id === after) + 1
  const page = nodes.slice(start, start + first)
  const last = page.at(-1)
  return {
    nodes: page,
    pageInfo: {
      hasNextPage: start + page.length < nodes.length,
      endCursor: last?.id ?? null,
    },
  }
}

const inputOf = (variables: Record<string, unknown>): Record<string, unknown> => {
  const decoded = Schema.decodeUnknownOption(recordSchema)(variables.input)
  return Option.isSome(decoded) ? decoded.value : {}
}

const stringField = (record: Record<string, unknown>, name: string): string => {
  const value = record[name]
  if (typeof value !== "string") {
    throw new TypeError(`Expected a string field ${name}.`)
  }
  return value
}

export {
  defaultEnv,
  defaultViewer,
  type FakeLabel,
  type FakeProject,
  type FakeTeam,
  type FakeViewer,
  type FakeWorkspace,
  type GraphQLRequest,
  type Handler,
  inputOf,
  jsonResponse,
  paginate,
  readRequest,
  stringField,
}
