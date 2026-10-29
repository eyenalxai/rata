import { Effect, Schema } from "effect"

import type { LinearApiError } from "@/api/errors"

const PageInfo = Schema.Struct({
  hasNextPage: Schema.Boolean,
  endCursor: Schema.NullOr(Schema.String),
})

type PageInfo = typeof PageInfo.Type

const maxPageSize = 250

type Connection<A> = {
  readonly nodes: readonly A[]
  readonly pageInfo: PageInfo
}

type PageOptions = {
  readonly after: string | null
  readonly limit: number
  readonly all?: boolean | undefined
}

const pageSize = 50

const lastPageInfo: PageInfo = { hasNextPage: false, endCursor: null }

const collectPages = <A>(
  initial: Connection<A>,
  fetch: (after: string) => Effect.Effect<Connection<A>, LinearApiError>,
): Effect.Effect<readonly A[], LinearApiError> =>
  Effect.gen(function* collectAllPages() {
    const nodes = [...initial.nodes]
    let pageInfo = initial.pageInfo
    while (pageInfo.hasNextPage && pageInfo.endCursor !== null) {
      const next = yield* fetch(pageInfo.endCursor)
      nodes.push(...next.nodes)
      pageInfo = next.pageInfo
    }
    return nodes
  })

const collectConnection = <A>(
  fetch: (after: string | null) => Effect.Effect<Connection<A>, LinearApiError>,
): Effect.Effect<readonly A[], LinearApiError> =>
  Effect.gen(function* collectEveryPage() {
    const first = yield* fetch(null)
    return yield* collectPages(first, (after) => fetch(after))
  })

const drainConnection = <A>(
  fetch: (after: string | null) => Effect.Effect<Connection<A>, LinearApiError>,
  after: string | null,
): Effect.Effect<Connection<A>, LinearApiError> =>
  Effect.gen(function* drainEveryPage() {
    const first = yield* fetch(after)
    const nodes = yield* collectPages(first, (cursor) => fetch(cursor))
    return { nodes, pageInfo: lastPageInfo }
  })

const pageOrDrain = <A>(
  fetch: (after: string | null) => Effect.Effect<Connection<A>, LinearApiError>,
  options: PageOptions,
): Effect.Effect<Connection<A>, LinearApiError> =>
  options.all === true ? drainConnection(fetch, options.after) : fetch(options.after)

export {
  type Connection,
  collectConnection,
  collectPages,
  drainConnection,
  lastPageInfo,
  maxPageSize,
  PageInfo,
  type PageOptions,
  pageOrDrain,
  pageSize,
}
