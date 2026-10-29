import type { IssueDetail, IssueStatus, IssueSummary } from "@/api/issue-model"

import { pullRequests } from "@/domain/pr"
import { isClosedState } from "@/domain/state"

const toSummary = (issue: IssueDetail): IssueSummary => ({
  id: issue.id,
  identifier: issue.identifier,
  title: issue.title,
  url: issue.url,
  state: issue.state,
  priority: issue.priority,
  updatedAt: issue.updatedAt,
  assignee: issue.assignee,
  project: issue.project,
  parent: issue.parent,
  labels: issue.labels,
})

const toIssueStatus = (issue: IssueDetail, nextChild: IssueSummary | null): IssueStatus => {
  const blockedBy = issue.relations.blockedBy.map((blocker) => ({
    identifier: blocker.identifier,
    title: blocker.title,
    state: blocker.state,
    closed: isClosedState(blocker.state.type),
  }))
  return {
    issue: toSummary(issue),
    blocked: blockedBy.some((blocker) => !blocker.closed),
    blockedBy,
    prs: pullRequests(issue.attachments),
    nextChild,
  }
}

export { toIssueStatus }
