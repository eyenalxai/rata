import { Effect } from "effect"

import type { LinearClientShape } from "@/linear/client"
import type { Connection } from "@/linear/connection"
import type {
  IssueAttachment,
  IssueComment,
  IssueInverseRelation,
  IssueLabel,
  IssueRelation,
} from "@/linear/decode/issue"
import type {
  IssueWorkingChildFullNode,
  IssueWorkingChildNode,
} from "@/linear/decode/issue/working-set"
import type { LinearApiError } from "@/linear/errors"
import type { PendingConnection } from "@/linear/operations/issue/working-set/model"

import {
  WorkingAttachmentsPageResponse,
  WorkingChildrenPageResponse,
  WorkingCommentsPageResponse,
  WorkingFullChildrenPageResponse,
  WorkingInverseRelationsPageResponse,
  WorkingLabelsPageResponse,
  WorkingRelationsPageResponse,
} from "@/linear/decode/issue/working-set"
import {
  workingAttachmentsPageQuery,
  workingChildrenPageQuery,
  workingCommentsPageQuery,
  workingInverseRelationsPageQuery,
  workingLabelsPageQuery,
  workingRelationsPageQuery,
} from "@/linear/documents/issue"
import { workingLimits } from "@/linear/documents/issue/fields"
import { aliasVariables } from "@/linear/operations/issue/working-set/pages"

type AliasFetch<Item> = (
  pending: readonly PendingConnection[],
) => Effect.Effect<readonly (Connection<Item> | undefined)[], LinearApiError>

const makeWorkingSetFetchers = (execute: LinearClientShape["execute"]) => ({
  labels:
    (first: number): AliasFetch<IssueLabel> =>
    (pending) =>
      execute(
        workingLabelsPageQuery(pending.length, first),
        aliasVariables(pending),
        WorkingLabelsPageResponse,
      ).pipe(Effect.map((data) => pending.map((_, index) => data[`issue${index}`]?.labels))),

  relations: (pending: readonly PendingConnection[]): ReturnType<AliasFetch<IssueRelation>> =>
    execute(
      workingRelationsPageQuery(pending.length, workingLimits.relations),
      aliasVariables(pending),
      WorkingRelationsPageResponse,
    ).pipe(Effect.map((data) => pending.map((_, index) => data[`issue${index}`]?.relations))),

  inverseRelations:
    (first: number): AliasFetch<IssueInverseRelation> =>
    (pending: readonly PendingConnection[]) =>
      execute(
        workingInverseRelationsPageQuery(pending.length, first),
        aliasVariables(pending),
        WorkingInverseRelationsPageResponse,
      ).pipe(
        Effect.map((data) => pending.map((_, index) => data[`issue${index}`]?.inverseRelations)),
      ),

  children: (
    pending: readonly PendingConnection[],
  ): ReturnType<AliasFetch<IssueWorkingChildNode>> =>
    execute(
      workingChildrenPageQuery(pending.length, workingLimits.children, false),
      aliasVariables(pending),
      WorkingChildrenPageResponse,
    ).pipe(Effect.map((data) => pending.map((_, index) => data[`issue${index}`]?.children))),

  fullChildren: (
    pending: readonly PendingConnection[],
  ): ReturnType<AliasFetch<IssueWorkingChildFullNode>> =>
    execute(
      workingChildrenPageQuery(pending.length, workingLimits.children, true),
      aliasVariables(pending),
      WorkingFullChildrenPageResponse,
    ).pipe(Effect.map((data) => pending.map((_, index) => data[`issue${index}`]?.children))),

  attachments: (pending: readonly PendingConnection[]): ReturnType<AliasFetch<IssueAttachment>> =>
    execute(
      workingAttachmentsPageQuery(pending.length, workingLimits.attachments),
      aliasVariables(pending),
      WorkingAttachmentsPageResponse,
    ).pipe(Effect.map((data) => pending.map((_, index) => data[`issue${index}`]?.attachments))),

  comments: (pending: readonly PendingConnection[]): ReturnType<AliasFetch<IssueComment>> =>
    execute(
      workingCommentsPageQuery(pending.length, workingLimits.comments),
      aliasVariables(pending),
      WorkingCommentsPageResponse,
    ).pipe(Effect.map((data) => pending.map((_, index) => data[`issue${index}`]?.comments))),
})

type WorkingSetFetchers = ReturnType<typeof makeWorkingSetFetchers>

export { makeWorkingSetFetchers, type WorkingSetFetchers }
