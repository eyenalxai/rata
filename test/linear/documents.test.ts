import { describe, expect, test } from "bun:test"
import { Option, Schema } from "effect"

import { attachmentId, issueId, labelId, teamId, userId } from "@/domain/id"
import { IssueSummaryNode } from "@/linear/decode/issue"
import { PageInfo } from "@/linear/decode/page"
import { TeamDetail } from "@/linear/decode/team"
import {
  listQuery,
  searchQuery,
  workingSetQuery,
  workingSummaryQuery,
} from "@/linear/documents/issue"
import { teamLabelsQuery, teamStatesQuery } from "@/linear/documents/team"

const summary = {
  id: issueId("issue-1"),
  identifier: "RAT-1",
  title: "The issue",
  url: "https://linear.app/acme/issue/RAT-1/the-issue",
  state: { name: "In Progress", type: "started" as const },
  priority: 1 as const,
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-02T00:00:00.000Z",
  assignee: { id: userId("user-1"), name: "Ada", displayName: "ada" },
  project: null,
  parent: null,
  labels: { nodes: [{ id: labelId("label-1"), name: "ready-for-agent" }] },
}

describe("Linear documents select the read fields", () => {
  test("the working-set document carries the working fields", () => {
    const document = workingSetQuery({ comments: true, full: false })

    expect(document).toContain("description")
    expect(document).toContain("createdAt")
    expect(document).toContain("updatedAt")
    expect(document).toContain("children(first: 50)")
    expect(document).not.toContain("relations(first: 25)")
    expect(document).toContain("inverseRelations(first: 25)")
    expect(document).toContain("attachments(first: 25)")
    expect(document).toContain("comments(first: 10, orderBy: createdAt)")
  })

  test("the full working-set document adds outgoing relations", () => {
    const document = workingSetQuery({ comments: false, full: true })

    expect(document).toContain("relations(first: 25)")
    expect(document).toContain("inverseRelations(first: 25)")
  })

  test("the summary document omits the working connections", () => {
    const document = workingSummaryQuery

    expect(document).toContain("labels(first: 25)")
    expect(document).not.toContain("description")
    expect(document).not.toContain("children(")
    expect(document).not.toContain("relations(")
  })

  test("the list and search documents carry summary fields", () => {
    expect(listQuery({ relations: true, sort: true })).toContain("sort: $sort")
    expect(listQuery({ relations: true, sort: false })).toContain("orderBy: createdAt")
    expect(listQuery({ relations: true, sort: false })).toContain("relations(first: 250)")
    expect(searchQuery).toContain("searchIssues")
    expect(searchQuery).not.toContain("orderBy")
  })

  test("the team documents select their detail fields", () => {
    expect(teamStatesQuery).toContain("position")
    expect(teamLabelsQuery).toContain("team: { null: true }")
  })
})

describe("Linear decoders", () => {
  test("maps the priority value to the domain union", () => {
    const decoded = Option.getOrThrow(Schema.decodeUnknownOption(IssueSummaryNode)(summary))

    expect(decoded.priority).toBe("urgent")
  })

  test("rejects an unknown priority and state type", () => {
    expect(Schema.decodeUnknownOption(IssueSummaryNode)({ ...summary, priority: 5 })).toEqual(
      Option.none(),
    )
    expect(
      Schema.decodeUnknownOption(IssueSummaryNode)({
        ...summary,
        state: { name: "Nowhere", type: "unknown" },
      }),
    ).toEqual(Option.none())
  })

  test("decodes a team detail with its label scope and state position", () => {
    const detail = Option.getOrThrow(
      Schema.decodeUnknownOption(TeamDetail)({
        id: teamId("00000000-0000-0000-0000-000000000001"),
        key: "RAT",
        name: "Rata",
        timezone: "UTC",
        states: [{ id: "state-1", name: "Todo", type: "unstarted", position: 0 }],
        labels: [{ id: labelId("label-1"), name: "bug", color: "#EB5757", scope: "workspace" }],
        members: [
          {
            id: userId("user-1"),
            name: "Ada",
            displayName: "ada",
            email: "ada@example.com",
          },
        ],
        priorities: [{ priority: 1, label: "Urgent" }],
      }),
    )

    expect(detail.states[0]?.position).toBe(0)
    expect(detail.labels[0]?.scope).toBe("workspace")
  })

  test("decodes a page info cursor", () => {
    expect(
      Option.getOrThrow(
        Schema.decodeUnknownOption(PageInfo)({ hasNextPage: true, endCursor: "cursor-1" }),
      ),
    ).toEqual({ hasNextPage: true, endCursor: "cursor-1" })
  })

  test("keeps attachment ids branded", () => {
    const decoded = Option.getOrThrow(
      Schema.decodeUnknownOption(
        Schema.Struct({
          attachments: Schema.Array(
            Schema.Struct({
              id: Schema.String.pipe(Schema.brand("AttachmentId")),
            }),
          ),
        }),
      )({ attachments: [{ id: attachmentId("attachment-1") }] }),
    )

    expect(String(decoded.attachments[0]?.id)).toBe("attachment-1")
  })
})
