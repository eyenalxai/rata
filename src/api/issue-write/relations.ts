import { Effect } from "effect"

import type { LinearClient } from "@/api/client"
import type {
  IssueRelationChanges,
  IssueWriteApiError,
  ResolvedRelationTarget,
} from "@/api/issue-write/model"

import { inverseRelationsQuery, relationsQuery } from "@/api/issue-query"
import { InverseRelationsResponse, RelationsResponse } from "@/api/issue-schema"
import { collectPages, pageSize } from "@/api/pagination"

type RelationResolverDependencies = {
  readonly client: LinearClient["Service"]
  readonly resolveIssueId: (ref: string) => Effect.Effect<string, IssueWriteApiError>
}

const makeRelationResolvers = ({ client, resolveIssueId }: RelationResolverDependencies) => {
  const resolveRelationTargets = Effect.fn("IssueWriteApi.resolveRelationTargets")(
    function* resolveRelationTargets(changes: IssueRelationChanges) {
      const targets: ResolvedRelationTarget[] = []
      for (const target of changes.blocks) {
        const targetId = yield* resolveIssueId(target)
        targets.push({ kind: "blocks", target, targetId })
      }
      for (const target of changes.blockedBy) {
        const targetId = yield* resolveIssueId(target)
        targets.push({ kind: "blockedBy", target, targetId })
      }
      for (const target of changes.related) {
        const targetId = yield* resolveIssueId(target)
        targets.push({ kind: "related", target, targetId })
      }
      for (const target of changes.duplicate) {
        const targetId = yield* resolveIssueId(target)
        targets.push({ kind: "duplicate", target, targetId })
      }
      return targets
    },
  )

  const collectRelations = Effect.fn("IssueWriteApi.collectRelations")(function* collectRelations(
    issueId: string,
  ) {
    const outgoingPage = yield* client.execute(
      relationsQuery,
      { id: issueId, first: pageSize, after: null },
      RelationsResponse,
    )
    const outgoing = yield* collectPages(outgoingPage.issue.relations, (after) =>
      client
        .execute(relationsQuery, { id: issueId, first: pageSize, after }, RelationsResponse)
        .pipe(Effect.map((page) => page.issue.relations)),
    )
    const incomingPage = yield* client.execute(
      inverseRelationsQuery,
      { id: issueId, first: pageSize, after: null },
      InverseRelationsResponse,
    )
    const incoming = yield* collectPages(incomingPage.issue.inverseRelations, (after) =>
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

  return { collectRelations, resolveRelationTargets }
}

export { makeRelationResolvers, type RelationResolverDependencies }
