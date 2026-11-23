import type { Priority } from "@/domain/priority"
import type { IssueSummary } from "@/tracker/model"

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
  readonly priority?: Priority | undefined
  readonly useDefaultLabels?: boolean | undefined
}

type IssueCreateResult = {
  readonly issue: IssueSummary
  readonly visible: WriteVisibility
}

export {
  type IssueCreateOptions,
  type IssueCreateResult,
  type VisibilityOptions,
  type WriteVisibility,
}
