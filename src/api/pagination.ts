import { Effect } from "effect"

import type { LinearApiError } from "@/api/errors"
import type { PageInfo } from "@/api/issue-schema"

type Connection<A> = {
  readonly nodes: readonly A[]
  readonly pageInfo: PageInfo
}

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

export { type Connection, collectPages }
