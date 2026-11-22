import type { RequestBody } from "@test/issue-fixtures"

import { pageInfo } from "@test/issue-fixtures"

import { attachmentId, commentId, issueId, labelId, relationId, userId } from "@/domain/id"

const member = { id: userId("u1"), name: "Ada", displayName: "ada" }

const attachment = (id: string, number: number) => ({
  id: attachmentId(id),
  title: `PR ${number}`,
  subtitle: "GitHub",
  url: `https://github.com/acme/rata/pull/${number}`,
  sourceType: "github",
  createdAt: "2026-01-01T00:00:00.000Z",
  metadata: { number, repo: "acme/rata" },
})

const label = (index: number) => ({ id: labelId(`label-${index}`), name: `label-${index}` })

const relationTarget = (identifier: string) => ({
  id: issueId(`issue-${identifier}`),
  identifier,
  title: `Title ${identifier}`,
  state: { name: "Todo", type: "unstarted" as const },
})

const outgoingRelation = (index: number) => ({
  id: relationId(`relation-${index}`),
  type: "blocks" as const,
  relatedIssue: relationTarget(`RAT-${100 + index}`),
})

const incomingRelation = (index: number, open = false) => ({
  id: relationId(`inverse-${index}`),
  type: "blocks" as const,
  issue: {
    ...relationTarget(`RAT-${200 + index}`),
    state: open
      ? { name: "Todo", type: "unstarted" as const }
      : { name: "Done", type: "completed" as const },
  },
})

const leanChild = (
  identifier: string,
  input: {
    readonly priority?: 0 | 1 | 2 | 3 | 4
    readonly assignee?: typeof member | null
    readonly createdAt?: string
  } = {},
) => ({
  id: issueId(`issue-${identifier}`),
  identifier,
  title: `Title ${identifier}`,
  state: { name: "Todo", type: "unstarted" as const },
  priority: input.priority ?? 2,
  createdAt: input.createdAt ?? "2026-01-01T00:00:00.000Z",
  assignee: input.assignee === undefined ? null : input.assignee,
  inverseRelations: { nodes: [], pageInfo },
})

const fullChild = (identifier: string) => ({
  id: issueId(`issue-${identifier}`),
  identifier,
  title: `Title ${identifier}`,
  url: `https://linear.app/acme/issue/${identifier}/title`,
  state: { name: "Todo", type: "unstarted" as const },
  priority: 2 as const,
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-02T00:00:00.000Z",
  assignee: null,
  project: null,
  parent: null,
  labels: {
    nodes: Array.from({ length: 10 }, (_, index) => label(index)),
    pageInfo: { hasNextPage: true, endCursor: "child-labels-1" },
  },
  inverseRelations: { nodes: [], pageInfo },
})

const comment = (index: number) => ({
  id: commentId(`comment-${index}`),
  body: `Comment ${index}`,
  createdAt: `2026-01-01T00:00:0${index % 10}.000Z`,
  user: member,
})

const node = {
  id: issueId("issue-RAT-1"),
  identifier: "RAT-1",
  title: "The issue",
  description: "Body",
  url: "https://linear.app/acme/issue/RAT-1/the-issue",
  state: { name: "In Progress", type: "started" as const },
  priority: 2 as const,
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-02T00:00:00.000Z",
  assignee: member,
  project: null,
  parent: null,
  labels: { nodes: [], pageInfo },
  relations: { nodes: [], pageInfo },
  inverseRelations: { nodes: [], pageInfo },
  children: { nodes: [], pageInfo },
  attachments: {
    nodes: [attachment("a1", 1)],
    pageInfo: { hasNextPage: true, endCursor: "attachment-cursor" },
  },
}

const requestOf = (body: RequestBody): string => body.query

export {
  attachment,
  comment,
  fullChild,
  label,
  leanChild,
  member,
  node,
  outgoingRelation,
  incomingRelation,
  requestOf,
}
