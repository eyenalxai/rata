import type {
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
  readonly assignee: IssueUser | null
  readonly project: IssueProject | null
  readonly parent: IssueParent | null
  readonly team: IssueTeam
  readonly labels: readonly IssueLabel[]
  readonly children: readonly IssueChild[]
  readonly relations: IssueRelations
  readonly comments?: readonly IssueComment[]
}

type IssuePage = {
  readonly issues: readonly IssueSummary[]
  readonly pageInfo: PageInfo
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

type IssueShowOptions = {
  readonly comments: boolean
}

const toSummary = (node: IssueSummaryNode): IssueSummary => ({
  id: node.id,
  identifier: node.identifier,
  title: node.title,
  url: node.url,
  state: node.state,
  priority: toPriority(node.priority),
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

const byPriority = (left: IssueSummary, right: IssueSummary): number =>
  priorityRank(left.priority) - priorityRank(right.priority)

const byCreatedAt = (left: IssueComment, right: IssueComment): number => {
  if (left.createdAt < right.createdAt) {
    return -1
  }
  if (left.createdAt > right.createdAt) {
    return 1
  }
  return 0
}

const sortComparators: Readonly<
  Record<SortField, (left: IssueSummary, right: IssueSummary) => number>
> = {
  priority: byPriority,
}

const collectsAllPages = (options: IssueListOptions): boolean => options.sort !== undefined

const sortAndLimitIssues = (
  issues: readonly IssueSummary[],
  options: IssueListOptions,
): readonly IssueSummary[] =>
  (options.sort === undefined ? issues : issues.toSorted(sortComparators[options.sort])).slice(
    0,
    options.limit,
  )

export {
  byCreatedAt,
  collectsAllPages,
  type IssueDetail,
  type IssueListOptions,
  type IssuePage,
  type IssueRelations,
  type IssueShowOptions,
  type IssueSummary,
  relationTargets,
  sortAndLimitIssues,
  type SortField,
  sortFields,
  type StateType,
  stateTypes,
  toSummary,
}
