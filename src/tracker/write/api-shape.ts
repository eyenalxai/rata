import type { Effect, Option } from "effect"

import type { ResolvedContext } from "@/context/model"
import type { CommentId } from "@/domain/id"
import type { Section, SectionReplacement } from "@/domain/section"
import type { IssueComment } from "@/linear/decode/issue"
import type { IssueSummary } from "@/tracker/model"
import type {
  BulkWriteResult,
  IssueCreatePlan,
  IssueWriteApiError,
  IssueRelationChanges,
  IssueWriteResult,
  RelationWriteResult,
  WriteOptions,
} from "@/tracker/write/model"
import type {
  CommentCreateOptions,
  CommentCreatePlan,
  CommentCreateResult,
  CommentDeletePlan,
  CommentDeleteResult,
  CommentUpdateOptions,
  CommentUpdateResult,
  IssueCreateOptions,
  IssueCreateResult,
  IssueUpdateOptions,
  IssueUpdatePlan,
  IssueUpdateSectionsOptions,
  IssueUpdateSectionsPlan,
  IssueUpdateSectionsResult,
  IssueUpdateWriteOptions,
  SectionWriteOptions,
  SectionWriteResult,
} from "@/tracker/write/write-types"

type IssueWriterShape = {
  readonly create: (
    context: ResolvedContext,
    options: IssueCreateOptions,
  ) => Effect.Effect<IssueCreateResult, IssueWriteApiError>
  readonly planCreate: (
    context: ResolvedContext,
    options: IssueCreateOptions,
  ) => Effect.Effect<IssueCreatePlan, IssueWriteApiError>
  readonly commentCreate: (
    context: ResolvedContext,
    ref: string,
    body: string,
    options?: CommentCreateOptions,
  ) => Effect.Effect<CommentCreateResult, IssueWriteApiError>
  readonly planCommentCreate: (
    context: ResolvedContext,
    ref: string,
    body: string,
    options?: CommentCreateOptions,
  ) => Effect.Effect<CommentCreatePlan, IssueWriteApiError>
  readonly commentUpdate: (
    context: ResolvedContext,
    commentId: CommentId,
    body: string,
    options?: CommentUpdateOptions,
  ) => Effect.Effect<CommentUpdateResult, IssueWriteApiError>
  readonly commentDelete: (
    context: ResolvedContext,
    commentId: CommentId,
  ) => Effect.Effect<CommentDeleteResult, IssueWriteApiError>
  readonly planCommentDelete: (
    context: ResolvedContext,
    commentId: CommentId,
  ) => Effect.Effect<CommentDeletePlan, IssueWriteApiError>
  readonly findComment: (
    context: ResolvedContext,
    commentId: CommentId,
  ) => Effect.Effect<Option.Option<IssueComment>, IssueWriteApiError>
  readonly update: (
    context: ResolvedContext,
    ref: string,
    options: IssueUpdateOptions,
    writeOptions?: IssueUpdateWriteOptions,
  ) => Effect.Effect<IssueSummary, IssueWriteApiError>
  readonly planUpdate: (
    context: ResolvedContext,
    ref: string,
    options: IssueUpdateOptions,
    writeOptions?: IssueUpdateWriteOptions,
  ) => Effect.Effect<IssueUpdatePlan, IssueWriteApiError>
  readonly updateSections: (
    context: ResolvedContext,
    ref: string,
    options: IssueUpdateSectionsOptions,
    sections: readonly SectionReplacement[],
    writeOptions?: IssueUpdateWriteOptions,
  ) => Effect.Effect<IssueUpdateSectionsResult, IssueWriteApiError>
  readonly planUpdateSections: (
    context: ResolvedContext,
    ref: string,
    options: IssueUpdateSectionsOptions,
    sections: readonly SectionReplacement[],
    writeOptions?: IssueUpdateWriteOptions,
  ) => Effect.Effect<IssueUpdateSectionsPlan, IssueWriteApiError>
  readonly readSection: (
    context: ResolvedContext,
    ref: string,
    heading: string,
  ) => Effect.Effect<Section, IssueWriteApiError>
  readonly appendSection: (
    context: ResolvedContext,
    ref: string,
    heading: string,
    body: string,
    options?: SectionWriteOptions,
  ) => Effect.Effect<SectionWriteResult, IssueWriteApiError>
  readonly replaceSection: (
    context: ResolvedContext,
    ref: string,
    heading: string,
    body: string,
    options?: SectionWriteOptions,
  ) => Effect.Effect<SectionWriteResult, IssueWriteApiError>
  readonly addLabels: (
    context: ResolvedContext,
    ref: string,
    names: readonly string[],
    options?: WriteOptions,
  ) => Effect.Effect<IssueWriteResult, IssueWriteApiError>
  readonly removeLabels: (
    context: ResolvedContext,
    ref: string,
    names: readonly string[],
    options?: WriteOptions,
  ) => Effect.Effect<IssueWriteResult, IssueWriteApiError>
  readonly assignChildren: (
    context: ResolvedContext,
    parentRef: string,
    assignee: string,
    options?: WriteOptions,
  ) => Effect.Effect<readonly BulkWriteResult[], IssueWriteApiError>
  readonly addLabelsToChildren: (
    context: ResolvedContext,
    parentRef: string,
    names: readonly string[],
    options?: WriteOptions,
  ) => Effect.Effect<readonly BulkWriteResult[], IssueWriteApiError>
  readonly removeLabelsFromChildren: (
    context: ResolvedContext,
    parentRef: string,
    names: readonly string[],
    options?: WriteOptions,
  ) => Effect.Effect<readonly BulkWriteResult[], IssueWriteApiError>
  readonly close: (
    context: ResolvedContext,
    ref: string,
    body?: string,
    options?: WriteOptions,
  ) => Effect.Effect<IssueWriteResult, IssueWriteApiError>
  readonly reopen: (
    context: ResolvedContext,
    ref: string,
    options?: WriteOptions,
  ) => Effect.Effect<IssueWriteResult, IssueWriteApiError>
  readonly assign: (
    context: ResolvedContext,
    ref: string,
    assignee: string,
    options?: WriteOptions,
  ) => Effect.Effect<IssueWriteResult, IssueWriteApiError>
  readonly unassign: (
    context: ResolvedContext,
    ref: string,
    options?: WriteOptions,
  ) => Effect.Effect<IssueWriteResult, IssueWriteApiError>
  readonly link: (
    context: ResolvedContext,
    ref: string,
    changes: IssueRelationChanges,
    options?: WriteOptions,
  ) => Effect.Effect<RelationWriteResult, IssueWriteApiError>
  readonly unlink: (
    context: ResolvedContext,
    ref: string,
    changes: IssueRelationChanges,
    options?: WriteOptions,
  ) => Effect.Effect<RelationWriteResult, IssueWriteApiError>
}

export { type IssueWriterShape }
