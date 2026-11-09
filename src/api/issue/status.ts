import type { IssueDetail, IssueStatus, IssueSummary } from "@/api/issue-model"

import { isBlocked, toBlockers, toIssueSummary } from "@/api/issue-model"
import { pullRequests } from "@/domain/pr"

const toIssueStatus = (issue: IssueDetail, nextChild: IssueSummary | null): IssueStatus => {
  const blockedBy = toBlockers(issue.relations)
  return {
    ...toIssueSummary(issue),
    blocked: isBlocked(blockedBy),
    blockedBy,
    prs: pullRequests(issue.attachments),
    nextChild,
  }
}

export { toIssueStatus }
