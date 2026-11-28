import { Effect, Result } from "effect"

import type { IssueId, TeamId } from "@/domain/id"
import type { IssueRef } from "@/domain/issue-ref"
import type { PublishNode } from "@/domain/publish"
import type { PublishDependencies, PublishPlanError } from "@/tracker/publish/model"

import { TrackerError } from "@/domain/error"
import { parseIssueRef } from "@/domain/issue-ref"
import { publishUuid } from "@/domain/publish"

type DraftNode = {
  readonly node: PublishNode
  readonly id: string
  readonly parent: string | null
  readonly parentId: string | null
}

const toIssueRef = (value: string): IssueRef => {
  const parsed = parseIssueRef(value)
  if (Result.isFailure(parsed)) {
    throw new Error(`The publish client UUID ${value} is not a valid issue reference.`)
  }
  return parsed.success
}

const uniqueNames = (names: readonly string[]): readonly string[] => {
  const seen = new Map<string, string>()
  for (const name of names) {
    const normalized = name.toLowerCase()
    if (!seen.has(normalized)) {
      seen.set(normalized, name)
    }
  }
  return [...seen.values()]
}

const uniqueValues = (values: readonly string[]): readonly string[] => [...new Set(values)]

const chunk = <A>(items: readonly A[], size: number): readonly (readonly A[])[] => {
  const chunks: (readonly A[])[] = []
  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size))
  }
  return chunks
}

const externalTokens = (
  nodes: readonly PublishNode[],
  keys: ReadonlySet<string>,
): readonly string[] => {
  const tokens: string[] = []
  for (const node of nodes) {
    if (node.parent !== undefined && !keys.has(node.parent)) {
      tokens.push(node.parent)
    }
    for (const blocker of node.blockedBy ?? []) {
      if (!keys.has(blocker)) {
        tokens.push(blocker)
      }
    }
  }
  return uniqueValues(tokens)
}

const resolveReferences = Effect.fn("IssuePublish.resolveReferences")(function* resolveReferences(
  dependencies: PublishDependencies,
  tokens: readonly string[],
): Effect.fn.Return<ReadonlyMap<string, IssueId>, PublishPlanError> {
  const entries = yield* Effect.forEach(tokens, (token) =>
    dependencies.resolvers.resolveIssueId(token).pipe(Effect.map((id) => [token, id] as const)),
  )
  return new Map(entries)
})

const draftNodes = Effect.fn("IssuePublish.draftNodes")(function* draftPublishNodes(
  nodes: readonly PublishNode[],
  order: readonly string[],
  keys: ReadonlySet<string>,
  references: ReadonlyMap<string, IssueId>,
  documentParent: string | undefined,
  teamId: TeamId,
): Effect.fn.Return<readonly DraftNode[], PublishPlanError> {
  const byKey = new Map(nodes.map((node) => [node.key, node]))
  const drafts = new Map<string, DraftNode>()
  for (const key of order) {
    const node = byKey.get(key)
    if (node === undefined) {
      return yield* new TrackerError({
        code: "internal",
        message: `The publish order names the unknown node ${key}.`,
        hint: null,
      })
    }
    const parent = node.parent ?? documentParent ?? null
    let parentId: string | null = null
    if (parent !== null) {
      if (keys.has(parent)) {
        const resolved = drafts.get(parent)
        if (resolved === undefined) {
          return yield* new TrackerError({
            code: "internal",
            message: `The parent ${parent} is missing from the publish plan.`,
            hint: null,
          })
        }
        parentId = resolved.id
      } else {
        const resolved = references.get(parent)
        if (resolved === undefined) {
          return yield* new TrackerError({
            code: "internal",
            message: `The parent ${parent} has no resolved issue id.`,
            hint: null,
          })
        }
        parentId = resolved
      }
    }
    drafts.set(key, {
      node,
      id: publishUuid({ parentId, teamId, key }),
      parent,
      parentId,
    })
  }
  return [...drafts.values()]
})

export {
  chunk,
  type DraftNode,
  draftNodes,
  externalTokens,
  resolveReferences,
  toIssueRef,
  uniqueNames,
  uniqueValues,
}
