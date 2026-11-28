import { Effect, Result } from "effect"

import type { IssueId, TeamId } from "@/domain/id"
import type { IssueRef } from "@/domain/issue-ref"
import type { PublishGraphError, PublishNode } from "@/domain/publish"
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

const graphError = (error: PublishGraphError): TrackerError => {
  switch (error._tag) {
    case "empty": {
      return new TrackerError({
        code: "validation",
        message: "The publish document has no nodes.",
        hint: "Add at least one node.",
      })
    }
    case "duplicate-key": {
      return new TrackerError({
        code: "validation",
        message: `The publish document has two nodes with the key ${error.key}.`,
        hint: "Use one key per node.",
      })
    }
    case "missing-key": {
      return new TrackerError({
        code: "validation",
        message: `The ${error.field} of node ${error.node} names ${error.key}, which is not a node key or an issue reference.`,
        hint: "Use a key from this document, or an issue reference like RAT-42.",
      })
    }
    case "cycle": {
      return new TrackerError({
        code: "validation",
        message: `The publish graph has a cycle: ${error.keys.join(", ")}.`,
        hint: "Remove one parent or blockedBy edge between the nodes.",
      })
    }
    default: {
      return new TrackerError({
        code: "internal",
        message: "The publish graph error is unknown.",
        hint: null,
      })
    }
  }
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

const resolveReferences = (
  dependencies: PublishDependencies,
  tokens: readonly string[],
): Effect.Effect<ReadonlyMap<string, IssueId>, PublishPlanError> =>
  Effect.forEach(tokens, (token) =>
    dependencies.resolvers.resolveIssueId(token).pipe(Effect.map((id) => [token, id] as const)),
  ).pipe(Effect.map((entries) => new Map(entries)))

const draftNodes = (
  nodes: readonly PublishNode[],
  order: readonly string[],
  keys: ReadonlySet<string>,
  references: ReadonlyMap<string, IssueId>,
  documentParent: string | undefined,
  teamId: TeamId,
): Effect.Effect<readonly DraftNode[], PublishPlanError> =>
  Effect.gen(function* draftPublishNodes() {
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
  graphError,
  resolveReferences,
  toIssueRef,
  uniqueNames,
  uniqueValues,
}
