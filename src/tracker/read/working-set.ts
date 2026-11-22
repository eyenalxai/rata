import type { IssueChild, IssueComment } from "@/linear/decode/issue"
import type { IssueWorkingChildNode, IssueWorkingNode } from "@/linear/decode/issue/working-set"
import type {
  IssueReadDocument,
  IssueWorkingChild,
  IssueWorkingChildFull,
  IssueWorkingSet,
  IssueWorkingSetFull,
  IssueWorkingSetOptions,
} from "@/tracker/model"

import { parseBody, publicSection } from "@/domain/body/section/model"
import { pullRequests } from "@/domain/pr"
import { relationTargets } from "@/domain/relation"
import { isClosedState } from "@/domain/workflow-state"
import { byPriority, isBlocked, summaryFieldsOf, toBlockers } from "@/tracker/model"

type RelationSource = {
  readonly relations?: IssueWorkingNode["relations"] | undefined
  readonly inverseRelations?: IssueWorkingNode["inverseRelations"] | undefined
}

const blockersOf = (node: RelationSource): ReturnType<typeof toBlockers> =>
  toBlockers(
    relationTargets<IssueChild>(node.relations?.nodes ?? [], node.inverseRelations?.nodes ?? []),
  )

const leanChild = (node: IssueWorkingChildNode): IssueWorkingChild => {
  const blockedBy = blockersOf(node)
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

const fullChild = (node: IssueWorkingChildNode): IssueWorkingChildFull => {
  const blockedBy = blockersOf(node)
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

const sortedChildren = (node: IssueWorkingNode): readonly IssueWorkingChildNode[] =>
  [...(node.children?.nodes ?? [])].toSorted(byPriority)

const commentsOf = (node: IssueWorkingNode): readonly IssueComment[] =>
  (node.comments?.nodes ?? []).toSorted((left, right) =>
    left.createdAt < right.createdAt ? -1 : left.createdAt > right.createdAt ? 1 : 0,
  )

const workingBase = (node: IssueWorkingNode) => {
  const blockedBy = blockersOf(node)
  const description = node.description ?? null
  return {
    ...summaryFieldsOf(node),
    description,
    sections: description === null ? [] : parseBody(description).sections.map(publicSection),
    blocked: isBlocked(blockedBy),
    blockedBy,
    prs: pullRequests(node.attachments?.nodes ?? []),
  }
}

const toWorkingSet = (
  node: IssueWorkingNode,
  options: IssueWorkingSetOptions,
): IssueReadDocument => {
  if (options.mode === "summary") {
    return summaryFieldsOf(node)
  }
  const comments = options.comments ? commentsOf(node) : null
  if (options.mode === "full") {
    const children = sortedChildren(node).map(fullChild)
    const frontier = frontierOf(children)
    const full: IssueWorkingSetFull = {
      ...workingBase(node),
      children,
      frontier,
      nextChild: frontier[0] ?? null,
      comments,
      relations: relationTargets<IssueChild>(
        node.relations?.nodes ?? [],
        node.inverseRelations?.nodes ?? [],
      ),
    }
    return full
  }
  const children = sortedChildren(node).map(leanChild)
  const frontier = frontierOf(children)
  const working: IssueWorkingSet = {
    ...workingBase(node),
    children,
    frontier,
    nextChild: frontier[0] ?? null,
    comments,
  }
  return working
}

export { toWorkingSet }
