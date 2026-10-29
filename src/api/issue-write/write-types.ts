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
}

type IssueCommentResult = {
  readonly comment: IssueComment
  readonly visible: WriteVisibility
}

export {
  type IssueCommentResult,
  type IssueCreateOptions,
  type IssueCreateResult,
  type IssueUpdateOptions,
  type VisibilityOptions,
  type WriteVisibility,
}
