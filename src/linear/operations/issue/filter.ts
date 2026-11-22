import type { TeamId, UserId, IssueId } from "@/domain/id"
import type { IssueRef } from "@/domain/issue-ref"
import type { Priority } from "@/domain/priority"
import type { StateType } from "@/domain/workflow-state"
import type { PageOptions } from "@/linear/connection"

import { priorityValue } from "@/domain/priority"
import { closedStateTypes } from "@/domain/workflow-state"
import { composeFilter, projectFilter, teamIdFilter, textFilter } from "@/linear/filter"

type IssueSort = "priority"

type IssueListOptions = PageOptions & {
  readonly teamId?: TeamId | undefined
  readonly state?: string | undefined
  readonly stateType?: StateType | undefined
  readonly priority?: Priority | undefined
  readonly label?: string | undefined
  readonly assigneeId?: UserId | undefined
  readonly unassigned?: boolean | undefined
  readonly project?: string | undefined
  readonly parentId?: IssueId | undefined
  readonly text?: string | undefined
  readonly unblocked?: boolean | undefined
  readonly ids?: readonly IssueRef[] | undefined
  readonly include?: "relations" | undefined
  readonly sort?: IssueSort | undefined
}

const issueFilter = (options: IssueListOptions): Record<string, unknown> | undefined => {
  const parts: Record<string, unknown>[] = []
  if (options.teamId !== undefined) {
    parts.push(teamIdFilter(options.teamId))
  }
  if (options.state !== undefined) {
    parts.push({ state: { name: { eqIgnoreCase: options.state } } })
  }
  if (options.stateType !== undefined) {
    parts.push({ state: { type: { eq: options.stateType } } })
  }
  if (options.priority !== undefined) {
    parts.push({ priority: { eq: priorityValue(options.priority) } })
  }
  if (options.label !== undefined) {
    parts.push({ labels: { some: { name: { eqIgnoreCase: options.label } } } })
  }
  if (options.assigneeId !== undefined) {
    parts.push({ assignee: { id: { eq: options.assigneeId } } })
  }
  if (options.unassigned === true) {
    parts.push({ assignee: { null: true } })
  }
  if (options.project !== undefined) {
    parts.push(projectFilter(options.project))
  }
  if (options.parentId !== undefined) {
    parts.push({ parent: { id: { eq: options.parentId } } })
  }
  if (options.text !== undefined) {
    parts.push(textFilter(options.text))
  }
  if (options.unblocked === true) {
    parts.push(
      { hasBlockedByRelations: { eq: false } },
      { state: { type: { nin: closedStateTypes } } },
    )
  }
  if (options.ids !== undefined) {
    parts.push({ id: { in: options.ids } })
  }
  return composeFilter(parts)
}

export { issueFilter, type IssueListOptions, type IssueSort }
