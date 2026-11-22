import type { IssueChild, IssueComment } from "@/linear/decode/issue"
import type {
  IssueFullWorkingNode,
  IssueWorkingChildFullNode,
  IssueWorkingChildNode,
  IssueWorkingNode,
} from "@/linear/decode/issue/working-set"
import type {
  IssueSummary,
  IssueWorkingChild,
  IssueWorkingChildFull,
  IssueWorkingSet,
  IssueWorkingSetFull,
} from "@/tracker/model"

import { parseBody, publicSection } from "@/domain/body/section/model"
import { pullRequests } from "@/domain/pr"
import { relationTargets } from "@/domain/relation"
import { isClosedState } from "@/domain/workflow-state"
import { byPriority, isBlocked, summaryFieldsOf, toBlockers } from "@/tracker/model"

type WorkingNode = IssueWorkingNode | IssueFullWorkingNode

const inverseBlockersOf = (node: {
  readonly inverseRelations: IssueWorkingNode["inverseRelations"]
}) => toBlockers(relationTargets<IssueChild>([], node.inverseRelations.nodes))

const blockersOf = (node: WorkingNode) =>
  toBlockers(relationTargets<IssueChild>(node.relations.nodes, node.inverseRelations.nodes))

const leanChild = (node: IssueWorkingChildNode): IssueWorkingChild => {
  const blockedBy = inverseBlockersOf(node)
  return {
    id: node.id,
    identifier: node.identifier,
    title: node.title,
    state: node.state,
    priority: node.priority,
    assignee: node.assignee,
    blocked: isBlocked(blockedBy),
    blockedBy,
  }
}

const fullChild = (node: IssueWorkingChildFullNode): IssueWorkingChildFull => {
  const blockedBy = inverseBlockersOf(node)
  return {
    ...summaryFieldsOf(node),
    blocked: isBlocked(blockedBy),
    blockedBy,
  }
}

const frontierOf = <Child extends IssueWorkingChild>(
  children: readonly Child[],
): readonly Child[] =>
  children.filter(
    (child) => !isClosedState(child.state.type) && !child.blocked && child.assignee === null,
  )

const sortedChildren = <
  Child extends { readonly priority: IssueSummary["priority"]; readonly createdAt: string },
>(
  children: readonly Child[],
): readonly Child[] => [...children].toSorted(byPriority)

const commentsOf = (node: WorkingNode): readonly IssueComment[] | null =>
  node.comments === undefined
    ? null
    : [...node.comments.nodes].toSorted((left, right) =>
        left.createdAt < right.createdAt ? -1 : left.createdAt > right.createdAt ? 1 : 0,
      )

const workingBase = (node: WorkingNode) => {
  const blockedBy = blockersOf(node)
  const description = node.description
  return {
    ...summaryFieldsOf(node),
    description,
    sections: description === null ? [] : parseBody(description).sections.map(publicSection),
    blocked: isBlocked(blockedBy),
    blockedBy,
    prs: pullRequests(node.attachments.nodes),
  }
}

const toSummary = (node: WorkingNode): IssueSummary => summaryFieldsOf(node)

const toWorkingSet = (node: IssueWorkingNode): IssueWorkingSet => {
  const children = sortedChildren(node.children.nodes).map(leanChild)
  const frontier = frontierOf(children)
  return {
    ...workingBase(node),
    children,
    frontier,
    nextChild: frontier[0] ?? null,
    comments: commentsOf(node),
  }
}

const toFullWorkingSet = (node: IssueFullWorkingNode): IssueWorkingSetFull => {
  const children = sortedChildren(node.children.nodes).map(fullChild)
  const frontier = frontierOf(children)
  return {
    ...workingBase(node),
    children,
    frontier,
    nextChild: frontier[0] ?? null,
    comments: commentsOf(node),
    relations: relationTargets<IssueChild>(node.relations.nodes, node.inverseRelations.nodes),
  }
}

export { toFullWorkingSet, toSummary, toWorkingSet }
