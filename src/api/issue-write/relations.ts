import { Effect } from "effect"

import type { LinearClient } from "@/api/client"
import type {
  IssueRelationChanges,
  RelationKind,
  ResolvedRelationTarget,
} from "@/api/issue-write/model"

import {
  inverseRelationsQuery,
  issueRefsQuery,
  relationsQuery,
  relationsWithInverseQuery,
} from "@/api/issue-query/relation"
import {
  InverseRelationsResponse,
  IssueRefsResponse,
  RelationsResponse,
  RelationsWithInverseResponse,
} from "@/api/issue-schema/relation"
import { IssueRefNotFoundError } from "@/api/issue/batch"
import { collectConnection, collectPages, pageSize } from "@/api/pagination"
import { isUuid, parseRefOrFail } from "@/domain/ref"

type RelationResolverDependencies = {
  readonly client: LinearClient["Service"]
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
  ids: ReadonlyMap<string, string>,
  ref: string,
): Effect.Effect<string, IssueRefNotFoundError> => {
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
    refs: readonly string[],
  ) {
    const ids = new Map<string, string>()
    const unresolved: string[] = []
    for (const ref of refs) {
      if (isUuid(ref)) {
        ids.set(ref, ref)
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
    const issueId = yield* requireIssueId(ids, source)
    const targets = yield* Effect.forEach(parsed, (entry) =>
      requireIssueId(ids, entry.parsed).pipe(
        Effect.map((targetId): ResolvedRelationTarget => ({
          kind: entry.kind,
          target: entry.target,
          targetId,
        })),
      ),
    )
    return { issueId, targets }
  })

  const collectRelations = Effect.fn("IssueWriteApi.collectRelations")(function* collectRelations(
    issueId: string,
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
