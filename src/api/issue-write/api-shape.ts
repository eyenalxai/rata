import type { Effect, Option } from "effect"

import type { IssueSummary } from "@/api/issue-model"
import type { IssueComment } from "@/api/issue-schema"
import type {
  BulkWriteResult,
  IssueCreatePlan,
  IssueWriteApiError,
  IssueRelationChanges,
  IssueWriteResult,
  RelationWriteResult,
  WriteOptions,
} from "@/api/issue-write/model"
import type {
  CommentCreateOptions,
  CommentCreatePlan,
  CommentCreateResult,
  CommentDeletePlan,
  CommentDeleteResult,
  CommentUpdateOptions,
  CommentUpdateResult,
  IssueBodySnapshot,
  IssueCreateOptions,
  IssueCreateResult,
  IssueUpdateOptions,
  IssueUpdatePlan,
  IssueUpdateWriteOptions,
  SectionWriteOptions,
  SectionWriteResult,
} from "@/api/issue-write/write-types"
import type { Section } from "@/domain/body/section/model"

type IssueWriteApiShape = {
  readonly create: (
    options: IssueCreateOptions,
  ) => Effect.Effect<IssueCreateResult, IssueWriteApiError>
  readonly planCreate: (
    options: IssueCreateOptions,
  ) => Effect.Effect<IssueCreatePlan, IssueWriteApiError>
  readonly commentCreate: (
    ref: string,
    body: string,
    options?: CommentCreateOptions,
  ) => Effect.Effect<CommentCreateResult, IssueWriteApiError>
  readonly planCommentCreate: (
    ref: string,
    body: string,
    options?: CommentCreateOptions,
  ) => Effect.Effect<CommentCreatePlan, IssueWriteApiError>
  readonly commentUpdate: (
    commentId: string,
    body: string,
    options?: CommentUpdateOptions,
  ) => Effect.Effect<CommentUpdateResult, IssueWriteApiError>
  readonly commentDelete: (
    commentId: string,
  ) => Effect.Effect<CommentDeleteResult, IssueWriteApiError>
  readonly planCommentDelete: (
    commentId: string,
  ) => Effect.Effect<CommentDeletePlan, IssueWriteApiError>
  readonly findComment: (
    commentId: string,
  ) => Effect.Effect<Option.Option<IssueComment>, IssueWriteApiError>
  readonly update: (
    ref: string,
    options: IssueUpdateOptions,
    writeOptions?: IssueUpdateWriteOptions,
  ) => Effect.Effect<IssueSummary, IssueWriteApiError>
  readonly planUpdate: (
    ref: string,
    options: IssueUpdateOptions,
    writeOptions?: IssueUpdateWriteOptions,
  ) => Effect.Effect<IssueUpdatePlan, IssueWriteApiError>
  readonly readBody: (ref: string) => Effect.Effect<IssueBodySnapshot, IssueWriteApiError>
  readonly readSection: (ref: string, heading: string) => Effect.Effect<Section, IssueWriteApiError>
  readonly appendSection: (
    ref: string,
    heading: string,
    body: string,
    options?: SectionWriteOptions,
  ) => Effect.Effect<SectionWriteResult, IssueWriteApiError>
  readonly replaceSection: (
    ref: string,
    heading: string,
    body: string,
    options?: SectionWriteOptions,
  ) => Effect.Effect<SectionWriteResult, IssueWriteApiError>
  readonly addLabels: (
    ref: string,
    names: readonly string[],
    options?: WriteOptions,
  ) => Effect.Effect<IssueWriteResult, IssueWriteApiError>
  readonly removeLabels: (
    ref: string,
    names: readonly string[],
    options?: WriteOptions,
  ) => Effect.Effect<IssueWriteResult, IssueWriteApiError>
  readonly assignChildren: (
    parentRef: string,
    assignee: string,
    options?: WriteOptions,
  ) => Effect.Effect<readonly BulkWriteResult[], IssueWriteApiError>
  readonly addLabelsToChildren: (
    parentRef: string,
    names: readonly string[],
    options?: WriteOptions,
  ) => Effect.Effect<readonly BulkWriteResult[], IssueWriteApiError>
  readonly removeLabelsFromChildren: (
    parentRef: string,
    names: readonly string[],
    options?: WriteOptions,
  ) => Effect.Effect<readonly BulkWriteResult[], IssueWriteApiError>
  readonly close: (
    ref: string,
    body?: string,
    options?: WriteOptions,
  ) => Effect.Effect<IssueWriteResult, IssueWriteApiError>
  readonly reopen: (
    ref: string,
    options?: WriteOptions,
  ) => Effect.Effect<IssueWriteResult, IssueWriteApiError>
  readonly assign: (
    ref: string,
    assignee: string,
    options?: WriteOptions,
  ) => Effect.Effect<IssueWriteResult, IssueWriteApiError>
  readonly unassign: (
    ref: string,
    options?: WriteOptions,
  ) => Effect.Effect<IssueWriteResult, IssueWriteApiError>
  readonly link: (
    ref: string,
    changes: IssueRelationChanges,
    options?: WriteOptions,
  ) => Effect.Effect<RelationWriteResult, IssueWriteApiError>
  readonly unlink: (
    ref: string,
    changes: IssueRelationChanges,
    options?: WriteOptions,
  ) => Effect.Effect<RelationWriteResult, IssueWriteApiError>
}

export { type IssueWriteApiShape }
