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
}

const pageSize = 50

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

export {
  type Connection,
  collectConnection,
  collectPages,
  maxPageSize,
  PageInfo,
  type PageOptions,
  pageSize,
}
