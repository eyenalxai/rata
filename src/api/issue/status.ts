import type {
  IssueDetail,
  IssueStatus,
  IssueStatusChild,
  IssueStatusOptions,
  IssueSummary,
} from "@/api/issue-model"

import { isBlocked, toBlockers, toIssueSummary } from "@/api/issue-model"
import { pullRequests } from "@/domain/pr"
import { isClosedState } from "@/domain/state"

const withoutRelations = (issue: IssueSummary): IssueSummary => {
  const { relations: _relations, ...summary } = issue
  return summary
}

const toStatusChild = (issue: IssueSummary): IssueStatusChild => {
  const blockedBy = issue.relations === undefined ? [] : toBlockers(issue.relations)
  return { ...withoutRelations(issue), blocked: isBlocked(blockedBy), blockedBy }
}

const nextChildOf = (
  children: readonly IssueSummary[],
  allChildren: boolean,
): IssueSummary | null => {
  if (!allChildren) {
    const first = children[0]
    return first === undefined ? null : withoutRelations(first)
  }
  const next = children.find(
    (child) =>
      !isClosedState(child.state.type) &&
      (child.relations === undefined || child.relations.blockedBy.length === 0),
  )
  return next === undefined ? null : withoutRelations(next)
}

const toIssueStatus = (
  issue: IssueDetail,
  children: readonly IssueSummary[],
  options: IssueStatusOptions,
): IssueStatus => {
  const allChildren = options.children === true
  const blockedBy = toBlockers(issue.relations)
  return {
    ...toIssueSummary(issue),
    blocked: isBlocked(blockedBy),
    blockedBy,
    prs: pullRequests(issue.attachments),
    nextChild: nextChildOf(children, allChildren),
    ...(options.withBody === true ? { description: issue.description } : {}),
    ...(options.comments === true ? { comments: issue.comments ?? [] } : {}),
    ...(allChildren ? { children: children.map(toStatusChild) } : {}),
  }
}

export { toIssueStatus }
