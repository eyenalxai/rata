import type { IssueId, TeamId, UserId } from "@/domain/id"
import type { IssueListOptions as LinearIssueListOptions } from "@/linear/operations/issue/filter"
import type { IssueListOptions } from "@/tracker/model"

type PreparedList = {
  readonly teamId: TeamId
  readonly input: LinearIssueListOptions
}

type MutableListInput = {
  -readonly [K in keyof LinearIssueListOptions]: LinearIssueListOptions[K]
}

const listInput = (
  options: IssueListOptions,
  values: {
    readonly teamId: TeamId
    readonly assigneeId: UserId | undefined
    readonly parentId: IssueId | undefined
  },
): LinearIssueListOptions => {
  const input: MutableListInput = {
    after: options.after,
    limit: options.limit,
    teamId: values.teamId,
  }
  if (options.state !== undefined) {
    input.state = options.state
  }
  if (options.stateType !== undefined) {
    input.stateType = options.stateType
  }
  if (options.priority !== undefined) {
    input.priority = options.priority
  }
  if (options.label !== undefined) {
    input.label = options.label
  }
  if (values.assigneeId !== undefined) {
    input.assigneeId = values.assigneeId
  }
  if (options.unassigned !== undefined) {
    input.unassigned = options.unassigned
  }
  if (options.project !== undefined) {
    input.project = options.project
  }
  if (values.parentId !== undefined) {
    input.parentId = values.parentId
  }
  if (options.text !== undefined) {
    input.text = options.text
  }
  if (options.unblocked !== undefined) {
    input.unblocked = options.unblocked
  }
  if (options.include !== undefined) {
    input.include = options.include
  }
  if (options.sort !== undefined) {
    input.sort = options.sort
  }
  if (options.all !== undefined) {
    input.all = options.all
  }
  return input
}

export { listInput, type PreparedList }
