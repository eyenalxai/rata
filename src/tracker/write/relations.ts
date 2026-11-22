import { Effect } from "effect"

import type { IssueId } from "@/domain/id"
import type { IssueRef } from "@/domain/issue-ref"
import type { RelationKind } from "@/domain/relation"
import type { LinearClientShape } from "@/linear/client"
import type { IssueRelationChanges, ResolvedRelationTarget } from "@/tracker/write/model"

import { isUuid, issueId as asIssueId } from "@/domain/id"
import { parseRefOrFail } from "@/domain/issue-ref"
import { collectConnection, collectPages, pageSize } from "@/linear/connection"
import {
  InverseRelationsResponse,
  IssueRefsResponse,
  RelationsResponse,
  RelationsWithInverseResponse,
} from "@/linear/decode/relation"
import {
  inverseRelationsQuery,
  issueRefsQuery,
  relationsQuery,
  relationsWithInverseQuery,
} from "@/linear/documents/relation"
import { IssueRefNotFoundError } from "@/tracker/read/batch"

type RelationResolverDependencies = {
  readonly client: LinearClientShape
}

const relationGroups = (
  changes: IssueRelationChanges,
): readonly (readonly [RelationKind, readonly string[]])[] => [
  ["blocks", changes.blocks],
  ["blockedBy", changes.blockedBy],
  ["related", changes.related],
  ["duplicate", changes.duplicate],
]

const requireIssueId = (
  ids: ReadonlyMap<string, IssueId>,
  ref: string,
): Effect.Effect<IssueId, IssueRefNotFoundError> => {
  const id = ids.get(ref)
  if (id !== undefined) {
    return Effect.succeed(id)
  }
  return Effect.fail(
    new IssueRefNotFoundError({ refs: [ref], message: `No issue matches ${ref}.` }),
  )
}

const makeRelationResolvers = ({ client }: RelationResolverDependencies) => {
  const resolveIssueIds = Effect.fn("IssueWriteApi.resolveIssueIds")(function* resolveIssueIds(
    refs: readonly IssueRef[],
  ) {
    const ids = new Map<string, IssueId>()
    const unresolved: string[] = []
    for (const ref of refs) {
      if (isUuid(ref)) {
        ids.set(ref, asIssueId(ref))
      } else {
        unresolved.push(ref)
      }
    }
    if (unresolved.length > 0) {
      const nodes = yield* collectConnection((after) =>
        client
          .execute(
            issueRefsQuery,
            { filter: { id: { in: [...new Set(unresolved)] } }, first: pageSize, after },
            IssueRefsResponse,
          )
          .pipe(Effect.map((data) => data.issues)),
      )
      for (const node of nodes) {
        ids.set(node.id, node.id)
        ids.set(node.identifier, node.id)
      }
    }
    return ids
  })

  const resolveRelations = Effect.fn("IssueWriteApi.resolveRelations")(function* resolveRelations(
    ref: string,
    changes: IssueRelationChanges,
  ) {
    const source = yield* parseRefOrFail(ref)
    const entries = relationGroups(changes).flatMap(([kind, targets]) =>
      targets.map((target) => ({ kind, target })),
    )
    const parsed = yield* Effect.forEach(entries, (entry) =>
      parseRefOrFail(entry.target).pipe(Effect.map((target) => ({ ...entry, parsed: target }))),
    )
    const ids = yield* resolveIssueIds([source, ...parsed.map((entry) => entry.parsed)])
    const sourceId = yield* requireIssueId(ids, source)
    const targets = yield* Effect.forEach(parsed, (entry) =>
      requireIssueId(ids, entry.parsed).pipe(
        Effect.map((targetId): ResolvedRelationTarget => ({
          kind: entry.kind,
          target: entry.target,
          targetId,
        })),
      ),
    )
    return { issueId: sourceId, targets }
  })

  const collectRelations = Effect.fn("IssueWriteApi.collectRelations")(function* collectRelations(
    issueId: IssueId,
  ) {
    const combined = yield* client.execute(
      relationsWithInverseQuery,
      { id: issueId, first: pageSize },
      RelationsWithInverseResponse,
    )
    const outgoing = yield* collectPages(combined.issue.relations, (after) =>
      client
        .execute(relationsQuery, { id: issueId, first: pageSize, after }, RelationsResponse)
        .pipe(Effect.map((page) => page.issue.relations)),
    )
    const incoming = yield* collectPages(combined.issue.inverseRelations, (after) =>
      client
        .execute(
          inverseRelationsQuery,
          { id: issueId, first: pageSize, after },
          InverseRelationsResponse,
        )
        .pipe(Effect.map((page) => page.issue.inverseRelations)),
    )
    return { incoming, outgoing }
  })

  return { collectRelations, resolveRelations }
}

export { makeRelationResolvers, type RelationResolverDependencies }
