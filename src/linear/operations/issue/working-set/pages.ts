import { Effect } from "effect"

import type { IssueId } from "@/domain/id"
import type { Connection } from "@/linear/connection"
import type { LinearApiError } from "@/linear/errors"
import type {
  ConnectionEntry,
  PendingConnection,
} from "@/linear/operations/issue/working-set/model"

import { lastPageInfo } from "@/linear/connection"
import { LinearGraphQLError } from "@/linear/errors"

const malformedPayload = (): LinearApiError =>
  new LinearGraphQLError({
    code: "internal",
    message: "Linear returned an unexpected response body.",
    details: [],
  })

const aliasVariables = (pending: readonly PendingConnection[]): Record<string, string> =>
  Object.fromEntries(
    pending.flatMap((item, index) => [
      [`id${index}`, item.id],
      [`after${index}`, item.cursor],
    ]),
  )

const drainAliasPages = <Item>(
  entries: readonly ConnectionEntry<Item>[],
  fetchPage: (
    pending: readonly PendingConnection[],
  ) => Effect.Effect<readonly (Connection<Item> | undefined)[], LinearApiError>,
): Effect.Effect<ReadonlyMap<IssueId, readonly Item[]>, LinearApiError> =>
  Effect.gen(function* drainWorkingConnectionPages() {
    const collected = new Map<IssueId, Item[]>()
    let pending: PendingConnection[] = []
    for (const entry of entries) {
      collected.set(entry.id, [...entry.items])
      if (entry.hasNextPage) {
        if (entry.endCursor === null) {
          return yield* malformedPayload()
        }
        pending.push({ id: entry.id, cursor: entry.endCursor })
      }
    }
    while (pending.length > 0) {
      const pages = yield* fetchPage(pending)
      const next: PendingConnection[] = []
      for (const [index, item] of pending.entries()) {
        const page = pages[index]
        const items = collected.get(item.id)
        if (page === undefined || items === undefined) {
          return yield* malformedPayload()
        }
        items.push(...page.nodes)
        if (page.pageInfo.hasNextPage) {
          if (page.pageInfo.endCursor === null) {
            return yield* malformedPayload()
          }
          next.push({ id: item.id, cursor: page.pageInfo.endCursor })
        }
      }
      pending = next
    }
    return collected
  })

const drainNodeConnection = <Node, Item>(input: {
  readonly nodes: readonly Node[]
  readonly idOf: (node: Node) => IssueId
  readonly connectionOf: (node: Node) => Connection<Item>
  readonly update: (node: Node, items: readonly Item[]) => Node
  readonly fetchPage: (
    pending: readonly PendingConnection[],
  ) => Effect.Effect<readonly (Connection<Item> | undefined)[], LinearApiError>
}): Effect.Effect<readonly Node[], LinearApiError> =>
  Effect.gen(function* drainWorkingNodeConnection() {
    const collected = yield* drainAliasPages(
      input.nodes.map((node) => {
        const connection = input.connectionOf(node)
        return {
          id: input.idOf(node),
          items: connection.nodes,
          hasNextPage: connection.pageInfo.hasNextPage,
          endCursor: connection.pageInfo.endCursor,
        }
      }),
      input.fetchPage,
    )
    return yield* Effect.forEach(input.nodes, (node) => {
      const items = collected.get(input.idOf(node))
      return items === undefined
        ? Effect.fail(malformedPayload())
        : Effect.succeed(input.update(node, items))
    })
  })

const rebuildChildren = <
  Node extends { readonly children: Connection<Item> },
  Item extends { readonly id: IssueId },
>(
  nodes: readonly Node[],
  drained: readonly Item[],
): Effect.Effect<readonly Node[], LinearApiError> => {
  const byId = new Map(drained.map((child) => [child.id, child]))
  return Effect.forEach(nodes, (node) =>
    Effect.forEach(node.children.nodes, (child) => {
      const found = byId.get(child.id)
      return found === undefined ? Effect.fail(malformedPayload()) : Effect.succeed(found)
    }).pipe(
      Effect.map((children) => ({
        ...node,
        children: { nodes: children, pageInfo: lastPageInfo },
      })),
    ),
  )
}

export { aliasVariables, drainAliasPages, drainNodeConnection, malformedPayload, rebuildChildren }
