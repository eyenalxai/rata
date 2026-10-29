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

type IssueCommentResult = {
  readonly comment: IssueComment
  readonly visible: WriteVisibility
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
  type IssueCommentResult,
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
