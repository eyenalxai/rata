import { describe, expect, test } from "bun:test"
import { Effect, Option, Schema } from "effect"

import type { LinearClientShape } from "@/linear/client"

import { attachmentId, issueId, teamId } from "@/domain/id"
import { IssueRef } from "@/domain/issue-ref"
import {
  AttachmentsResponse,
  ChildrenResponse,
  CommentsResponse,
  LabelsResponse,
  ShowResponse,
} from "@/linear/decode/issue"
import { InverseRelationsResponse, RelationsResponse } from "@/linear/decode/relation"
import { readIssueShow } from "@/linear/operations/issue/show"

const pageInfo: { readonly hasNextPage: boolean; readonly endCursor: string | null } = {
  hasNextPage: false,
  endCursor: null,
}
const emptyConnection = { nodes: [], pageInfo }

const issue = {
  id: issueId("issue-RAT-1"),
  identifier: "RAT-1",
  title: "The issue",
  description: "Body",
  url: "https://linear.app/acme/issue/RAT-1/the-issue",
  state: { name: "Todo", type: "unstarted" as const },
  priority: "none" as const,
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-02T00:00:00.000Z",
  assignee: null,
  project: null,
  parent: null,
  team: { id: teamId("team-1"), key: "RAT", name: "Rata" },
  labels: emptyConnection,
  children: emptyConnection,
  relations: emptyConnection,
  inverseRelations: emptyConnection,
  attachments: emptyConnection,
}

const attachmentNode = (id: string) => ({
  id: attachmentId(id),
  title: id,
  subtitle: null,
  url: `https://example.com/${id}`,
  sourceType: "link",
  createdAt: "2026-01-01T00:00:00.000Z",
})

const issueRef = Option.getOrThrow(Schema.decodeUnknownOption(IssueRef)("RAT-1"))

type FakePage = { readonly nodes: readonly unknown[]; readonly pageInfo: typeof pageInfo }

const executeFor = (
  paths: { readonly attachments?: readonly FakePage[]; readonly issue?: unknown } = {},
) =>
  ((_query, variables, schema) => {
    const decoder: unknown = schema
    if (decoder === ShowResponse) {
      return Effect.succeed({ issue: paths.issue ?? issue })
    }
    if (decoder === LabelsResponse) {
      return Effect.succeed({ issue: { labels: emptyConnection } })
    }
    if (decoder === ChildrenResponse) {
      return Effect.succeed({ issue: { children: emptyConnection } })
    }
    if (decoder === RelationsResponse) {
      return Effect.succeed({ issue: { relations: emptyConnection } })
    }
    if (decoder === InverseRelationsResponse) {
      return Effect.succeed({ issue: { inverseRelations: emptyConnection } })
    }
    if (decoder === AttachmentsResponse) {
      const page = variables.after === null ? paths.attachments?.[0] : paths.attachments?.[1]
      return Effect.succeed({ issue: { attachments: page ?? emptyConnection } })
    }
    if (decoder === CommentsResponse) {
      return Effect.succeed({ issue: { comments: emptyConnection } })
    }
    return Effect.die(new Error("Unexpected schema."))
  }) as LinearClientShape["execute"]

describe("readIssueShow shape", () => {
  test("omits skipped connections and keeps requested empty connections", async () => {
    const execute = executeFor()
    const skipped = await Effect.runPromise(
      readIssueShow(execute, issueRef, {
        comments: false,
        children: false,
        relations: false,
        attachments: false,
      }),
    )
    const requested = await Effect.runPromise(readIssueShow(execute, issueRef, { comments: false }))

    expect(skipped).not.toHaveProperty("children")
    expect(skipped).not.toHaveProperty("relations")
    expect(skipped).not.toHaveProperty("attachments")
    expect(requested.children).toEqual([])
    expect(requested.relations).toEqual({
      blocks: [],
      blockedBy: [],
      duplicates: [],
      duplicatedBy: [],
      related: [],
      similar: [],
    })
    expect(requested.attachments).toEqual([])
  })

  test("drains every page of attachments", async () => {
    const first: FakePage = {
      nodes: [attachmentNode("a1")],
      pageInfo: { hasNextPage: true, endCursor: "a1" },
    }
    const second: FakePage = {
      nodes: [attachmentNode("a2")],
      pageInfo,
    }
    const detail = await Effect.runPromise(
      readIssueShow(
        executeFor({
          issue: { ...issue, attachments: first },
          attachments: [first, second],
        }),
        issueRef,
        { comments: false },
      ),
    )

    expect(detail.attachments?.map((attachment) => String(attachment.id))).toEqual(["a1", "a2"])
  })
})
