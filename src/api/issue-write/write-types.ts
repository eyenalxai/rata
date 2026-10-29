import type { IssueSummary } from "@/api/issue-model"
import type { IssueComment } from "@/api/issue-schema"

type VisibilityOptions = {
  readonly waitSeconds?: number | undefined
}

type WriteVisibility = boolean | null

type IssueCreateOptions = VisibilityOptions & {
  readonly title: string
  readonly body?: string | undefined
  readonly team?: string | undefined
  readonly labels?: readonly string[] | undefined
  readonly parent?: string | undefined
  readonly project?: string | undefined
  readonly state?: string | undefined
  readonly assignee?: string | undefined
  readonly priority?: number | undefined
  readonly useDefaultLabels?: boolean | undefined
}

type IssueCreateResult = {
  readonly issue: IssueSummary
  readonly visible: WriteVisibility
}

type IssueUpdateOptions = {
  readonly title?: string | undefined
  readonly body?: string | undefined
  readonly state?: string | undefined
  readonly assignee?: string | undefined
  readonly project?: string | undefined
  readonly parent?: string | undefined
  readonly priority?: number | undefined
  readonly append?: boolean | undefined
}

type IssueUpdateWriteOptions = {
  readonly ifUnchanged?: string | undefined
}

type IssueUpdatePlan = {
  readonly identifier: string
  readonly changes: Readonly<Record<string, unknown>>
  readonly diff: string | null
}

type CommentCreateOptions = VisibilityOptions & {
  readonly id?: string | undefined
  readonly dedupeKey?: string | undefined
}

type CommentCreatePlan = {
  readonly status: "created" | "skipped"
  readonly action: "comment-create"
  readonly target: string
  readonly changes: {
    readonly body: string
    readonly dedupeKey?: string | undefined
    readonly commentId?: string | undefined
  }
}

type CommentCreateResult = {
  readonly status: "created" | "skipped"
  readonly comment: IssueComment
  readonly visible: WriteVisibility
}

type CommentUpdateOptions = {
  readonly dryRun?: boolean | undefined
}

type CommentUpdateResult =
  | {
      readonly dryRun: true
      readonly action: "comment-update"
      readonly target: string
      readonly diff: string
    }
  | {
      readonly dryRun: false
      readonly status: "updated"
      readonly comment: IssueComment
    }

type CommentDeletePlan = {
  readonly action: "comment-delete"
  readonly target: string
  readonly comment: IssueComment
}

type CommentDeleteResult = {
  readonly status: "deleted"
  readonly commentId: string
}

type SectionWriteOptions = {
  readonly dryRun?: boolean | undefined
  readonly ifUnchanged?: string | undefined
  readonly level?: number | undefined
}

type SectionWriteResult =
  | {
      readonly dryRun: true
      readonly action: "section-append" | "section-replace"
      readonly target: string
      readonly heading: string
      readonly level: number
      readonly diff: string
    }
  | {
      readonly dryRun: false
      readonly action: "section-append" | "section-replace"
      readonly target: string
      readonly heading: string
      readonly level: number
      readonly issue: IssueSummary
    }

export {
  type CommentCreateOptions,
  type CommentCreatePlan,
  type CommentCreateResult,
  type CommentDeletePlan,
  type CommentDeleteResult,
  type CommentUpdateOptions,
  type CommentUpdateResult,
  type IssueCreateOptions,
  type IssueCreateResult,
  type IssueUpdateOptions,
  type IssueUpdatePlan,
  type IssueUpdateWriteOptions,
  type SectionWriteOptions,
  type SectionWriteResult,
  type VisibilityOptions,
  type WriteVisibility,
}
