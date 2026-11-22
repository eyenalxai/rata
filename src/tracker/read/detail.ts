import type { IssueDetailData } from "@/linear/operations/issue/show"
import type { IssueDetail } from "@/tracker/model"

import { relationTargets } from "@/domain/relation"

const toIssueDetail = (data: IssueDetailData): IssueDetail => ({
  ...data,
  children: data.children ?? [],
  relations: data.relations ?? relationTargets([], []),
  attachments: data.attachments ?? [],
})

export { toIssueDetail }
