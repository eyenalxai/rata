import type {
  IssueAttachment,
  IssueChild,
  IssueComment,
  IssueInverseRelation,
  IssueLabel,
  IssueParent,
  IssueProject,
  IssueRelation,
  IssueState,
  IssueSummaryNode,
  IssueTeam,
  IssueUser,
} from "@/api/issue-schema"
import type { PageInfo, PageOptions } from "@/api/pagination"
import type { PullRequest } from "@/domain/pr"
import type { Priority } from "@/domain/priority"

import { priorityRank, toPriority } from "@/domain/priority"

const stateTypes = ["triage", "backlog", "unstarted", "started", "completed", "canceled"] as const
type StateType = (typeof stateTypes)[number]

const sortFields = ["priority"] as const
type SortField = (typeof sortFields)[number]

type IssueSummary = {
  readonly id: string
  readonly identifier: string
  readonly title: string
  readonly url: string
  readonly state: IssueState
  readonly priority: Priority
  readonly updatedAt: string
  readonly assignee: IssueUser | null
  readonly project: IssueProject | null
  readonly parent: IssueParent | null
  readonly labels: readonly IssueLabel[]
}

type IssueRelations = {
  readonly blocks: readonly IssueChild[]
  readonly blockedBy: readonly IssueChild[]
  readonly duplicates: readonly IssueChild[]
  readonly duplicatedBy: readonly IssueChild[]
  readonly related: readonly IssueChild[]
  readonly similar: readonly IssueChild[]
}

type IssueDetail = {
  readonly id: string
  readonly identifier: string
  readonly title: string
  readonly description: string | null
  readonly url: string
  readonly state: IssueState
  readonly priority: Priority
  readonly updatedAt: string
  readonly assignee: IssueUser | null
  readonly project: IssueProject | null
  readonly parent: IssueParent | null
  readonly team: IssueTeam
  readonly labels: readonly IssueLabel[]
  readonly children: readonly IssueChild[]
  readonly relations: IssueRelations
  readonly attachments: readonly IssueAttachment[]
  readonly comments?: readonly IssueComment[] | undefined
}

type IssuePage = {
  readonly issues: readonly IssueSummary[]
  readonly pageInfo: PageInfo
}

type IssueBlocker = {
  readonly identifier: string
  readonly title: string
  readonly state: IssueState
  readonly closed: boolean
}

type IssueStatus = {
  readonly issue: IssueSummary
  readonly blocked: boolean
  readonly blockedBy: readonly IssueBlocker[]
  readonly prs: readonly PullRequest[]
  readonly nextChild: IssueSummary | null
}

type IssueListOptions = PageOptions & {
  readonly team?: string | undefined
  readonly state?: string | undefined
  readonly stateType?: StateType | undefined
  readonly priority?: number | undefined
  readonly label?: string | undefined
  readonly assignee?: string | undefined
  readonly project?: string | undefined
  readonly parent?: string | undefined
  readonly text?: string | undefined
  readonly unblocked?: boolean | undefined
  readonly unassigned?: boolean | undefined
  readonly sort?: SortField | undefined
}

type IssueSearchOptions = PageOptions & {
  readonly team?: string | undefined
}

type IssueShowOptions = {
  readonly comments: boolean
  readonly relations?: boolean | undefined
  readonly children?: boolean | undefined
  readonly attachments?: boolean | undefined
}

const toSummary = (node: IssueSummaryNode): IssueSummary => ({
  id: node.id,
  identifier: node.identifier,
  title: node.title,
  url: node.url,
  state: node.state,
  priority: toPriority(node.priority),
  updatedAt: node.updatedAt,
  assignee: node.assignee,
  project: node.project,
  parent: node.parent,
  labels: node.labels.nodes,
})

const relationTargets = (
  outgoing: readonly IssueRelation[],
  incoming: readonly IssueInverseRelation[],
): IssueRelations => ({
  blocks: outgoing
    .filter((relation) => relation.type === "blocks")
    .map((relation) => relation.relatedIssue),
  blockedBy: incoming
    .filter((relation) => relation.type === "blocks")
    .map((relation) => relation.issue),
  duplicates: outgoing
    .filter((relation) => relation.type === "duplicate")
    .map((relation) => relation.relatedIssue),
  duplicatedBy: incoming
    .filter((relation) => relation.type === "duplicate")
    .map((relation) => relation.issue),
  related: [
    ...outgoing
      .filter((relation) => relation.type === "related")
      .map((relation) => relation.relatedIssue),
    ...incoming.filter((relation) => relation.type === "related").map((relation) => relation.issue),
  ],
  similar: [
    ...outgoing
      .filter((relation) => relation.type === "similar")
      .map((relation) => relation.relatedIssue),
    ...incoming.filter((relation) => relation.type === "similar").map((relation) => relation.issue),
  ],
})

const byCreatedAt = (
  left: { readonly createdAt: string },
  right: { readonly createdAt: string },
): number => {
  if (left.createdAt < right.createdAt) {
    return -1
  }
  if (left.createdAt > right.createdAt) {
    return 1
  }
  return 0
}

const byPriority = (left: IssueSummaryNode, right: IssueSummaryNode): number => {
  const rank = priorityRank(toPriority(left.priority)) - priorityRank(toPriority(right.priority))
  return rank === 0 ? byCreatedAt(left, right) : rank
}

const sortComparators: Readonly<
  Record<SortField, (left: IssueSummaryNode, right: IssueSummaryNode) => number>
> = {
  priority: byPriority,
}

const collectsAllPages = (options: IssueListOptions): boolean =>
  options.sort !== undefined || options.all === true

const sortAndLimitNodes = (
  nodes: readonly IssueSummaryNode[],
  options: IssueListOptions,
): readonly IssueSummaryNode[] => {
  const sorted = options.sort === undefined ? nodes : nodes.toSorted(sortComparators[options.sort])
  return options.all === true ? sorted : sorted.slice(0, options.limit)
}

export {
  byCreatedAt,
  collectsAllPages,
  type IssueBlocker,
  type IssueDetail,
  type IssueListOptions,
  type IssuePage,
  type IssueRelations,
  type IssueSearchOptions,
  type IssueShowOptions,
  type IssueStatus,
  type IssueSummary,
  relationTargets,
  sortAndLimitNodes,
  type SortField,
  sortFields,
  type StateType,
  stateTypes,
  toSummary,
}
