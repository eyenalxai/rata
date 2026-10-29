import type { IssueDetail, IssueStatus, IssueSummary } from "@/api/issue-model"

import { isBlocked, toBlockers } from "@/api/issue-model"
import { pullRequests } from "@/domain/pr"

const summaryOf = (issue: IssueDetail): IssueSummary => {
  const {
    description: _description,
    team: _team,
    children: _children,
    relations: _relations,
    attachments: _attachments,
    comments: _comments,
    ...summary
  } = issue
  return summary
}

const toIssueStatus = (issue: IssueDetail, nextChild: IssueSummary | null): IssueStatus => {
  const blockedBy = toBlockers(issue.relations)
  return {
    issue: summaryOf(issue),
    blocked: isBlocked(blockedBy),
    blockedBy,
    prs: pullRequests(issue.attachments),
    nextChild,
  }
}

export { toIssueStatus }
