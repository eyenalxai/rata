import type { IssueDetail } from "@/api/issue-model"
import type { IssueDetailData } from "@/linear/operations/issue/show"

import { relationTargets } from "@/domain/relation"

const toIssueDetail = (data: IssueDetailData): IssueDetail => ({
  ...data,
  children: data.children ?? [],
  relations: data.relations ?? relationTargets([], []),
  attachments: data.attachments ?? [],
})

export { toIssueDetail }
