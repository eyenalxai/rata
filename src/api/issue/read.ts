import type { IssueDetail } from "@/api/issue-model"
import type { IssueDetailData } from "@/linear/operations/issue"

const toIssueDetail = (data: IssueDetailData): IssueDetail => ({
  id: data.id,
  identifier: data.identifier,
  title: data.title,
  description: data.description,
  url: data.url,
  state: data.state,
  priority: data.priority,
  createdAt: data.createdAt,
  updatedAt: data.updatedAt,
  assignee: data.assignee,
  project: data.project,
  parent: data.parent,
  team: data.team,
  labels: data.labels,
  children: data.children,
  relations: data.relations,
  attachments: data.attachments,
  ...(data.comments === undefined ? {} : { comments: data.comments }),
})

export { toIssueDetail }
