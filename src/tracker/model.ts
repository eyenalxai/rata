import type { IssueId } from "@/domain/id"
import type { PullRequest } from "@/domain/pr"
import type { Priority } from "@/domain/priority"
import type { RelationTargets } from "@/domain/relation"
import type { Section } from "@/domain/section"
import type { StateType } from "@/domain/workflow-state"
import type { PageOptions } from "@/linear/connection"
import type {
  IssueChild,
  IssueComment,
  IssueLabel,
  IssueParent,
  IssueProject,
  IssueState,
  IssueSummaryNode,
  IssueUser,
} from "@/linear/decode/issue"
import type { PageInfo } from "@/linear/decode/page"

import { priorityRank } from "@/domain/priority"
import { relationTargets } from "@/domain/relation"
import { isClosedState } from "@/domain/workflow-state"

const sortFields = ["priority"] as const
type SortField = (typeof sortFields)[number]

const listIncludes = ["relations"] as const
type ListInclude = (typeof listIncludes)[number]

const isListInclude = (value: string): value is ListInclude =>
  listIncludes.some((include) => include === value)

type IssueSummary = {
  readonly id: IssueId
  readonly identifier: string
  readonly title: string
  readonly url: string
  readonly state: IssueState
  readonly priority: Priority
  readonly createdAt: string
  readonly updatedAt: string
  readonly assignee: IssueUser | null
  readonly project: IssueProject | null
  readonly parent: IssueParent | null
  readonly labels: readonly IssueLabel[]
  readonly relations?: IssueRelations | undefined
}

type IssueRelations = RelationTargets<IssueChild>

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

type IssueHeader = Pick<
  IssueSummary,
  "id" | "identifier" | "title" | "state" | "priority" | "assignee" | "project" | "parent"
>

type IssueWorkingChild = IssueHeader & {
  readonly blocked: boolean
  readonly blockedBy: readonly IssueBlocker[]
}

type IssueWorkingChildFull = IssueWorkingChild &
  Pick<IssueSummary, "url" | "createdAt" | "updatedAt" | "labels">

type IssueWorkingSetBase<Child> = IssueHeader & {
  readonly description: string | null
  readonly sections: readonly Section[]
  readonly blocked: boolean
  readonly blockedBy: readonly IssueBlocker[]
  readonly prs: readonly PullRequest[]
  readonly children: readonly Child[]
  readonly frontier: readonly Child[]
  readonly nextChild: Child | null
  readonly comments: readonly IssueComment[] | null
}

type IssueWorkingSet = IssueWorkingSetBase<IssueWorkingChild>

type IssueWorkingSetFull = IssueWorkingSetBase<IssueWorkingChildFull> &
  Pick<IssueSummary, "url" | "createdAt" | "updatedAt" | "labels"> & {
    readonly relations: IssueRelations
  }

type IssueWorkingSetOptions = {
  readonly comments: boolean
  readonly full: boolean
}

type IssueListOptions = PageOptions & {
  readonly team?: string | undefined
  readonly state?: string | undefined
  readonly stateType?: StateType | undefined
  readonly priority?: Priority | undefined
  readonly label?: string | undefined
  readonly assignee?: string | undefined
  readonly project?: string | undefined
  readonly parent?: string | undefined
  readonly text?: string | undefined
  readonly unblocked?: boolean | undefined
  readonly unassigned?: boolean | undefined
  readonly include?: ListInclude | undefined
  readonly sort?: SortField | undefined
}

type IssueSearchOptions = PageOptions & {
  readonly team?: string | undefined
}

const summaryRelations = (node: IssueSummaryNode): IssueRelations | undefined =>
  node.relations === undefined || node.inverseRelations === undefined
    ? undefined
    : relationTargets(node.relations.nodes, node.inverseRelations.nodes)

const toSummary = (node: IssueSummaryNode): IssueSummary => {
  const relations = summaryRelations(node)
  return {
    id: node.id,
    identifier: node.identifier,
    title: node.title,
    url: node.url,
    state: node.state,
    priority: node.priority,
    createdAt: node.createdAt,
    updatedAt: node.updatedAt,
    assignee: node.assignee,
    project: node.project,
    parent: node.parent,
    labels: node.labels.nodes,
    ...(relations === undefined ? {} : { relations }),
  }
}

const toBlockers = (relations: IssueRelations): readonly IssueBlocker[] =>
  relations.blockedBy.map((blocker) => ({
    identifier: blocker.identifier,
    title: blocker.title,
    state: blocker.state,
    closed: isClosedState(blocker.state.type),
  }))

const isBlocked = (blockers: readonly IssueBlocker[]): boolean =>
  blockers.some((blocker) => !blocker.closed)

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
  const rank = priorityRank(left.priority) - priorityRank(right.priority)
  return rank === 0 ? byCreatedAt(left, right) : rank
}

const sortComparators: Readonly<
  Record<SortField, (left: IssueSummaryNode, right: IssueSummaryNode) => number>
> = {
  priority: byPriority,
}

const collectsAllPages = (options: IssueListOptions): boolean => options.all === true

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
  type IssueHeader,
  type IssueListOptions,
  type IssuePage,
  type IssueRelations,
  type IssueSearchOptions,
  type IssueSummary,
  type IssueWorkingChild,
  type IssueWorkingChildFull,
  type IssueWorkingSet,
  type IssueWorkingSetFull,
  type IssueWorkingSetOptions,
  isBlocked,
  isListInclude,
  type ListInclude,
  listIncludes,
  sortAndLimitNodes,
  type SortField,
  sortFields,
  toBlockers,
  toSummary,
}
