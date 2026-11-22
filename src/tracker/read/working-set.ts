import type { IssueChild, IssueComment, IssueSummaryNode } from "@/linear/decode/issue"
import type { IssueWorkingChildNode, IssueWorkingNode } from "@/linear/decode/issue/working-set"
import type {
  IssueHeader,
  IssueWorkingChild,
  IssueWorkingChildFull,
  IssueWorkingSet,
  IssueWorkingSetFull,
  IssueWorkingSetOptions,
} from "@/tracker/model"

import { parseBody, publicSection } from "@/domain/body/section/model"
import { pullRequests } from "@/domain/pr"
import { priorityRank } from "@/domain/priority"
import { relationTargets } from "@/domain/relation"
import { isClosedState } from "@/domain/workflow-state"
import { isBlocked, toBlockers } from "@/tracker/model"

type RelationSource = {
  readonly relations?: IssueWorkingNode["relations"] | undefined
  readonly inverseRelations?: IssueWorkingNode["inverseRelations"] | undefined
}

const byPriorityThenCreatedAt = (
  left: { readonly priority: IssueHeader["priority"]; readonly createdAt: string },
  right: { readonly priority: IssueHeader["priority"]; readonly createdAt: string },
): number => {
  const rank = priorityRank(left.priority) - priorityRank(right.priority)
  return rank === 0
    ? left.createdAt < right.createdAt
      ? -1
      : left.createdAt > right.createdAt
        ? 1
        : 0
    : rank
}

const blockersOf = (node: RelationSource): ReturnType<typeof toBlockers> =>
  toBlockers(
    relationTargets<IssueChild>(node.relations?.nodes ?? [], node.inverseRelations?.nodes ?? []),
  )

const headerOf = (node: IssueSummaryNode): IssueHeader => ({
  id: node.id,
  identifier: node.identifier,
  title: node.title,
  state: node.state,
  priority: node.priority,
  assignee: node.assignee,
  project: node.project,
  parent: node.parent,
})

const leanChild = (node: IssueWorkingChildNode): IssueWorkingChild => {
  const blockedBy = blockersOf(node)
  return {
    ...headerOf(node),
    blocked: isBlocked(blockedBy),
    blockedBy,
  }
}

const fullChild = (node: IssueWorkingChildNode): IssueWorkingChildFull => ({
  ...leanChild(node),
  url: node.url,
  createdAt: node.createdAt,
  updatedAt: node.updatedAt,
  labels: node.labels.nodes,
})

const frontierOf = <Child extends IssueWorkingChild>(
  children: readonly Child[],
): readonly Child[] =>
  children.filter(
    (child) => !isClosedState(child.state.type) && !child.blocked && child.assignee === null,
  )

const sortedChildren = (node: IssueWorkingNode): readonly IssueWorkingChildNode[] =>
  [...node.children.nodes].toSorted(byPriorityThenCreatedAt)

const commentsOf = (node: IssueWorkingNode): readonly IssueComment[] =>
  (node.comments?.nodes ?? []).toSorted((left, right) =>
    left.createdAt < right.createdAt ? -1 : left.createdAt > right.createdAt ? 1 : 0,
  )

const toWorkingSet = (
  node: IssueWorkingNode,
  options: IssueWorkingSetOptions,
): IssueWorkingSet | IssueWorkingSetFull => {
  const blockedBy = blockersOf(node)
  const description = node.description
  const comments = options.comments ? commentsOf(node) : null
  const sections = description === null ? [] : parseBody(description).sections.map(publicSection)
  if (options.full) {
    const children = sortedChildren(node).map(fullChild)
    const frontier = frontierOf(children)
    return {
      ...headerOf(node),
      url: node.url,
      createdAt: node.createdAt,
      updatedAt: node.updatedAt,
      labels: node.labels.nodes,
      description,
      sections,
      blocked: isBlocked(blockedBy),
      blockedBy,
      prs: pullRequests(node.attachments.nodes),
      children,
      frontier,
      nextChild: frontier[0] ?? null,
      comments,
      relations: relationTargets<IssueChild>(node.relations.nodes, node.inverseRelations.nodes),
    }
  }
  const children = sortedChildren(node).map(leanChild)
  const frontier = frontierOf(children)
  return {
    ...headerOf(node),
    description,
    sections,
    blocked: isBlocked(blockedBy),
    blockedBy,
    prs: pullRequests(node.attachments.nodes),
    children,
    frontier,
    nextChild: frontier[0] ?? null,
    comments,
  }
}

export { toWorkingSet }
