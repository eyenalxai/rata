import type { MemoryIssue } from "@test/fake-linear/gateway/model"

import type { IssueChild, IssueSummaryNode } from "@/linear/decode/issue"
import type {
  IssueFullWorkingNode,
  IssueWorkingChildFullNode,
  IssueWorkingChildNode,
  IssueWorkingNode,
  WorkingSummaryNode,
} from "@/linear/decode/issue/working-set"
import type { IssueListOptions } from "@/linear/operations/issue/filter"

import { isUuid, relationId } from "@/domain/id"
import { priorityRank } from "@/domain/priority"
import { isClosedState } from "@/domain/workflow-state"

const byPriority = (left: IssueSummaryNode, right: IssueSummaryNode): number => {
  const rank = priorityRank(left.priority) - priorityRank(right.priority)
  if (rank !== 0) {
    return rank
  }
  if (left.createdAt < right.createdAt) {
    return -1
  }
  return left.createdAt > right.createdAt ? 1 : 0
}

const matchesTeam = (issue: MemoryIssue, options: IssueListOptions): boolean =>
  options.teamId === undefined || issue.team.id === options.teamId

const matchesState = (issue: MemoryIssue, options: IssueListOptions): boolean =>
  (options.state === undefined ||
    issue.summary.state.name.toLowerCase() === options.state.toLowerCase()) &&
  (options.stateType === undefined || issue.summary.state.type === options.stateType)

const matchesPriority = (issue: MemoryIssue, options: IssueListOptions): boolean =>
  options.priority === undefined || issue.summary.priority === options.priority

const matchesLabel = (issue: MemoryIssue, options: IssueListOptions): boolean =>
  options.label === undefined ||
  issue.summary.labels.nodes.some(
    (label) => label.name.toLowerCase() === options.label?.toLowerCase(),
  )

const matchesAssignee = (issue: MemoryIssue, options: IssueListOptions): boolean =>
  (options.assigneeId === undefined || issue.summary.assignee?.id === options.assigneeId) &&
  (options.unassigned !== true || issue.summary.assignee === null)

const matchesProject = (issue: MemoryIssue, options: IssueListOptions): boolean => {
  if (options.project === undefined) {
    return true
  }
  const project = issue.summary.project
  if (project === null) {
    return false
  }
  return isUuid(options.project)
    ? project.id === options.project
    : project.name.toLowerCase() === options.project.toLowerCase()
}

const matchesParent = (issue: MemoryIssue, options: IssueListOptions): boolean =>
  options.parentId === undefined || issue.summary.parent?.id === options.parentId

const matchesText = (issue: MemoryIssue, options: IssueListOptions): boolean => {
  if (options.text === undefined) {
    return true
  }
  const text = options.text.toLowerCase()
  return (
    issue.summary.title.toLowerCase().includes(text) ||
    (issue.description ?? "").toLowerCase().includes(text)
  )
}

const matchesUnblocked = (issue: MemoryIssue, options: IssueListOptions): boolean => {
  if (options.unblocked !== true) {
    return true
  }
  const blocked = (issue.inverseRelations ?? []).some((relation) => relation.type === "blocks")
  return !blocked && !isClosedState(issue.summary.state.type)
}

const matchesIds = (issue: MemoryIssue, options: IssueListOptions): boolean => {
  if (options.ids === undefined) {
    return true
  }
  const refs = new Set(options.ids.map(String))
  return refs.has(String(issue.summary.id)) || refs.has(issue.summary.identifier)
}

const matchesIssue = (issue: MemoryIssue, options: IssueListOptions): boolean =>
  matchesTeam(issue, options) &&
  matchesState(issue, options) &&
  matchesPriority(issue, options) &&
  matchesLabel(issue, options) &&
  matchesAssignee(issue, options) &&
  matchesProject(issue, options) &&
  matchesParent(issue, options) &&
  matchesText(issue, options) &&
  matchesUnblocked(issue, options) &&
  matchesIds(issue, options)

const withRelations = (issue: MemoryIssue, include: "relations" | undefined): IssueSummaryNode => {
  if (include !== "relations") {
    return issue.summary
  }
  const relations = issue.relations ?? []
  const inverseRelations = issue.inverseRelations ?? []
  return {
    ...issue.summary,
    relations: {
      nodes: relations.map((relation, index) => ({
        id: relationId(`relation-${issue.summary.identifier}-${index}`),
        type: relation.type,
        relatedIssue: relation.relatedIssue,
      })),
      pageInfo: { hasNextPage: false, endCursor: null },
    },
    inverseRelations: {
      nodes: inverseRelations.map((relation, index) => ({
        id: relationId(`inverse-relation-${issue.summary.identifier}-${index}`),
        type: relation.type,
        issue: relation.issue,
      })),
      pageInfo: { hasNextPage: false, endCursor: null },
    },
  }
}

const relationConnections = (issue: MemoryIssue) => ({
  relations: {
    nodes: (issue.relations ?? []).map((relation, index) => ({
      id: relationId(`relation-${issue.summary.identifier}-${index}`),
      type: relation.type,
      relatedIssue: relation.relatedIssue,
    })),
    pageInfo: { hasNextPage: false, endCursor: null },
  },
  inverseRelations: {
    nodes: (issue.inverseRelations ?? []).map((relation, index) => ({
      id: relationId(`inverse-relation-${issue.summary.identifier}-${index}`),
      type: relation.type,
      issue: relation.issue,
    })),
    pageInfo: { hasNextPage: false, endCursor: null },
  },
})

const childSummary = (child: IssueChild, issues: readonly MemoryIssue[]): IssueSummaryNode => {
  const issue = issues.find(
    (candidate) =>
      String(candidate.summary.id) === String(child.id) ||
      candidate.summary.identifier === child.identifier,
  )
  if (issue === undefined) {
    return {
      id: child.id,
      identifier: child.identifier,
      title: child.title,
      url: "",
      state: child.state,
      priority: "none",
      createdAt: "",
      updatedAt: "",
      assignee: null,
      project: null,
      parent: null,
      labels: { nodes: [] },
      inverseRelations: { nodes: [], pageInfo: { hasNextPage: false, endCursor: null } },
    }
  }
  return {
    ...issue.summary,
    ...relationConnections(issue),
  }
}

const labelConnection = (summary: IssueSummaryNode) => ({
  nodes: summary.labels.nodes,
  pageInfo: { hasNextPage: false, endCursor: null },
})

const inverseOf = (summary: IssueSummaryNode) =>
  summary.inverseRelations ?? { nodes: [], pageInfo: { hasNextPage: false, endCursor: null } }

const summaryNode = (issue: MemoryIssue): WorkingSummaryNode => ({
  ...issue.summary,
  labels: labelConnection(issue.summary),
})

const leanChildNode = (summary: IssueSummaryNode): IssueWorkingChildNode => ({
  id: summary.id,
  identifier: summary.identifier,
  title: summary.title,
  state: summary.state,
  priority: summary.priority,
  createdAt: summary.createdAt,
  assignee: summary.assignee,
  inverseRelations: inverseOf(summary),
})

const fullChildNode = (summary: IssueSummaryNode): IssueWorkingChildFullNode => ({
  ...summary,
  labels: labelConnection(summary),
  inverseRelations: inverseOf(summary),
})

const commentsOf = (issue: MemoryIssue, requested: boolean) =>
  requested
    ? {
        comments: {
          nodes: [...(issue.comments ?? [])].toSorted((left, right) =>
            left.createdAt < right.createdAt ? -1 : left.createdAt > right.createdAt ? 1 : 0,
          ),
          pageInfo: { hasNextPage: false, endCursor: null },
        },
      }
    : {}

const toWorking = (
  issue: MemoryIssue,
  issues: readonly MemoryIssue[],
  options: { readonly comments: boolean },
): IssueWorkingNode => ({
  ...summaryNode(issue),
  description: issue.description,
  children: {
    nodes: (issue.children ?? []).map((item) => leanChildNode(childSummary(item, issues))),
    pageInfo: { hasNextPage: false, endCursor: null },
  },
  inverseRelations: relationConnections(issue).inverseRelations,
  attachments: {
    nodes: issue.attachments ?? [],
    pageInfo: { hasNextPage: false, endCursor: null },
  },
  ...commentsOf(issue, options.comments),
})

const toFullWorking = (
  issue: MemoryIssue,
  issues: readonly MemoryIssue[],
  options: { readonly comments: boolean },
): IssueFullWorkingNode => ({
  ...summaryNode(issue),
  description: issue.description,
  children: {
    nodes: (issue.children ?? []).map((item) => fullChildNode(childSummary(item, issues))),
    pageInfo: { hasNextPage: false, endCursor: null },
  },
  ...relationConnections(issue),
  attachments: {
    nodes: issue.attachments ?? [],
    pageInfo: { hasNextPage: false, endCursor: null },
  },
  ...commentsOf(issue, options.comments),
})

export {
  byPriority,
  matchesIssue,
  relationConnections,
  summaryNode,
  toFullWorking,
  toWorking,
  withRelations,
}
