import { jsonResponse, pageInfo, summaryNode, viewer } from "@test/issue-fixtures"
import { makeRecorder, teamDetailResponse } from "@test/issue-write/fixtures"

import type { IssueInverseRelation, IssueRelation } from "@/api/issue-schema"

import { issueId, relationId } from "@/domain/id"

type WriteState = {
  readonly assignee: typeof viewer | null
  readonly labels: readonly { readonly id: string; readonly name: string }[]
  readonly outgoing: readonly IssueRelation[]
  readonly incoming: readonly IssueInverseRelation[]
}

const outgoingBlocks: IssueRelation = {
  id: relationId("rel-out"),
  type: "blocks",
  relatedIssue: {
    id: issueId("i2"),
    identifier: "RAT-2",
    title: "Dependent",
    state: { name: "Todo", type: "unstarted" },
  },
}

const state: WriteState = {
  assignee: viewer,
  labels: [{ id: "l1", name: "ready-for-agent" }],
  outgoing: [outgoingBlocks],
  incoming: [],
}

const issueIds: Readonly<Record<string, string>> = {
  "RAT-1": "i1",
  "RAT-2": "i2",
  "RAT-3": "i3",
  "RAT-9": "i9",
}

const refNodes = Object.entries(issueIds).map(([identifier, id]) => ({ id, identifier }))

const recorderFor = (current: WriteState) =>
  makeRecorder((request) => {
    const detail = teamDetailResponse(request, {
      labels: [
        { id: "l1", name: "ready-for-agent", color: "#111111", teamId: "team-1" },
        { id: "l-bug", name: "bug", color: "#EB5757", teamId: "team-1" },
      ],
    })
    if (detail !== undefined) {
      return detail
    }
    if (request.query.includes("query IssueSummary")) {
      return jsonResponse({
        data: {
          issue: {
            ...summaryNode("RAT-1"),
            assignee: current.assignee,
            labels: { nodes: current.labels },
          },
        },
      })
    }
    if (request.query.includes("query Viewer")) {
      return jsonResponse({ data: { viewer } })
    }
    if (request.query.includes("query IssueId")) {
      return jsonResponse({
        data: { issue: { id: issueIds[String(request.variables.id)] ?? "i9" } },
      })
    }
    if (request.query.includes("query IssueRefs")) {
      return jsonResponse({ data: { issues: { nodes: refNodes, pageInfo } } })
    }
    if (request.query.includes("query IssueTeam")) {
      return jsonResponse({ data: { issue: { team: { id: "team-1" } } } })
    }
    if (request.query.includes("query IssueLabels")) {
      return jsonResponse({
        data: { issue: { labels: { nodes: current.labels, pageInfo } } },
      })
    }
    if (request.query.includes("query AvailableLabels")) {
      return jsonResponse({
        data: {
          issueLabels: {
            nodes: [
              { id: "l1", name: "ready-for-agent", color: "#111111" },
              { id: "l-bug", name: "bug", color: "#EB5757" },
            ],
            pageInfo,
          },
        },
      })
    }
    if (request.query.includes("query IssueRelationsWithInverse")) {
      const relations = { nodes: current.outgoing, pageInfo }
      const inverseRelations = { nodes: current.incoming, pageInfo }
      return jsonResponse({ data: { issue: { relations, inverseRelations } } })
    }
    if (request.query.includes("mutation UpdateIssue")) {
      return jsonResponse({
        data: {
          issueUpdate: {
            success: true,
            issue: { ...summaryNode("RAT-1"), assignee: current.assignee },
          },
        },
      })
    }
    if (request.query.includes("mutation AddLabel")) {
      return jsonResponse({
        data: { issueAddLabel: { success: true, issue: summaryNode("RAT-1") } },
      })
    }
    if (request.query.includes("mutation RemoveLabel")) {
      return jsonResponse({
        data: { issueRemoveLabel: { success: true, issue: summaryNode("RAT-1") } },
      })
    }
    if (request.query.includes("mutation IssueRelationCreate")) {
      return jsonResponse({ data: { issueRelationCreate: { success: true } } })
    }
    if (request.query.includes("mutation IssueRelationDelete")) {
      return jsonResponse({ data: { issueRelationDelete: { success: true } } })
    }
    return jsonResponse({ errors: [{ message: `Unexpected query: ${request.query}` }] }, 400)
  })

export { type WriteState, recorderFor, state }
