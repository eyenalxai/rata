import { Result, Schema } from "effect"
import { createHash } from "node:crypto"

import { parseIssueRef } from "@/domain/issue-ref"
import { PrioritySchema } from "@/domain/priority"

const publishKinds = [
  "spec",
  "ticket",
  "map",
  "decision",
  "research",
  "prototype",
  "grilling",
  "task",
] as const
type PublishKind = (typeof publishKinds)[number]

const PublishKindSchema = Schema.Literals(publishKinds)

const PublishDefaultsSchema = Schema.Struct({
  priority: Schema.optional(PrioritySchema),
  labels: Schema.optional(Schema.Array(Schema.String)),
  assignee: Schema.optional(Schema.NullOr(Schema.String)),
  state: Schema.optional(Schema.String),
})
type PublishDefaults = typeof PublishDefaultsSchema.Type

const PublishNodeSchema = Schema.Struct({
  key: Schema.String,
  kind: PublishKindSchema,
  title: Schema.String,
  body: Schema.optional(Schema.String),
  priority: Schema.optional(PrioritySchema),
  labels: Schema.optional(Schema.Array(Schema.String)),
  assignee: Schema.optional(Schema.NullOr(Schema.String)),
  state: Schema.optional(Schema.String),
  parent: Schema.optional(Schema.String),
  blockedBy: Schema.optional(Schema.Array(Schema.String)),
})
type PublishNode = typeof PublishNodeSchema.Type

const PublishDocumentSchema = Schema.Struct({
  team: Schema.optional(Schema.String),
  parent: Schema.optional(Schema.String),
  defaults: Schema.optional(PublishDefaultsSchema),
  nodes: Schema.Array(PublishNodeSchema),
})
type PublishDocument = typeof PublishDocumentSchema.Type

const PublishDocumentJson = Schema.fromJsonString(PublishDocumentSchema)

type PublishGraphError =
  | { readonly _tag: "empty" }
  | { readonly _tag: "duplicate-key"; readonly key: string }
  | {
      readonly _tag: "missing-key"
      readonly key: string
      readonly node: string
      readonly field: "parent" | "blockedBy"
    }
  | { readonly _tag: "cycle"; readonly keys: readonly string[] }

type PublishUuidInput = {
  readonly parentId: string | null
  readonly teamId: string
  readonly key: string
}

const publishUuid = (input: PublishUuidInput): string => {
  const hash = createHash("sha256")
  // A top-level node has no parent id, so the team id gives the UUID its scope.
  hash.update(input.parentId ?? `team:${input.teamId}`)
  hash.update("\0")
  hash.update(input.key)
  const bytes = Uint8Array.from(hash.digest().subarray(0, 16))
  bytes[6] = ((bytes[6] ?? 0) % 16) + 64
  bytes[8] = ((bytes[8] ?? 0) % 64) + 128
  const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("")
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`
}

const duplicateKey = (nodes: readonly PublishNode[]): string | undefined => {
  const seen = new Set<string>()
  for (const node of nodes) {
    if (seen.has(node.key)) {
      return node.key
    }
    seen.add(node.key)
  }
  return undefined
}

const nodeDependencies = (node: PublishNode): readonly string[] => [
  ...(node.parent === undefined ? [] : [node.parent]),
  ...(node.blockedBy ?? []),
]

const isMissingKey = (value: string, keys: ReadonlySet<string>): boolean =>
  !keys.has(value) && Result.isFailure(parseIssueRef(value))

const checkMissingKeys = (
  nodes: readonly PublishNode[],
  keys: ReadonlySet<string>,
): PublishGraphError | undefined => {
  for (const node of nodes) {
    if (node.parent !== undefined && isMissingKey(node.parent, keys)) {
      return { _tag: "missing-key", key: node.parent, node: node.key, field: "parent" }
    }
    for (const blocker of node.blockedBy ?? []) {
      if (isMissingKey(blocker, keys)) {
        return { _tag: "missing-key", key: blocker, node: node.key, field: "blockedBy" }
      }
    }
  }
  return undefined
}

const publishOrder = (
  nodes: readonly PublishNode[],
): Result.Result<readonly string[], PublishGraphError> => {
  if (nodes.length === 0) {
    return Result.fail({ _tag: "empty" })
  }
  const duplicate = duplicateKey(nodes)
  if (duplicate !== undefined) {
    return Result.fail({ _tag: "duplicate-key", key: duplicate })
  }
  const keys = new Set(nodes.map((node) => node.key))
  const missing = checkMissingKeys(nodes, keys)
  if (missing !== undefined) {
    return Result.fail(missing)
  }
  const dependents = new Map<string, string[]>()
  const indegree = new Map<string, number>()
  for (const node of nodes) {
    const internal = new Set(nodeDependencies(node).filter((dependency) => keys.has(dependency)))
    indegree.set(node.key, internal.size)
    for (const dependency of internal) {
      dependents.set(dependency, [...(dependents.get(dependency) ?? []), node.key])
    }
  }
  const queue = nodes.filter((node) => indegree.get(node.key) === 0).map((node) => node.key)
  const ordered: string[] = []
  let cursor = 0
  while (cursor < queue.length) {
    const key = queue[cursor]
    cursor += 1
    if (key === undefined) {
      break
    }
    ordered.push(key)
    for (const dependent of dependents.get(key) ?? []) {
      const remaining = (indegree.get(dependent) ?? 1) - 1
      indegree.set(dependent, remaining)
      if (remaining === 0) {
        queue.push(dependent)
      }
    }
  }
  if (ordered.length !== nodes.length) {
    const visited = new Set(ordered)
    const cycle = nodes.filter((node) => !visited.has(node.key)).map((node) => node.key)
    return Result.fail({ _tag: "cycle", keys: cycle })
  }
  return Result.succeed(ordered)
}

export {
  type PublishDefaults,
  PublishDefaultsSchema,
  type PublishDocument,
  PublishDocumentJson,
  PublishDocumentSchema,
  type PublishGraphError,
  type PublishKind,
  publishKinds,
  PublishKindSchema,
  type PublishNode,
  PublishNodeSchema,
  publishOrder,
  type PublishUuidInput,
  publishUuid,
}
