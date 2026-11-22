import type { RequestBody } from "@test/issue-fixtures"

import { jsonResponse, pageInfo, readBody, run } from "@test/issue-fixtures"
import { describe, expect, test } from "bun:test"
import { Effect } from "effect"

import { attachmentId, issueId, userId } from "@/domain/id"
import { IssueReader } from "@/tracker/read"

const attachment = (id: string, number: number) => ({
  id: attachmentId(id),
  title: `PR ${number}`,
  subtitle: "GitHub",
  url: `https://github.com/acme/rata/pull/${number}`,
  sourceType: "github",
  createdAt: "2026-01-01T00:00:00.000Z",
  metadata: { number, repo: "acme/rata" },
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
  assignee: { id: userId("u1"), name: "Ada", displayName: "ada" },
  project: null,
  parent: null,
  labels: { nodes: [] },
  relations: { nodes: [], pageInfo },
  inverseRelations: { nodes: [], pageInfo },
  children: { nodes: [], pageInfo },
  attachments: {
    nodes: [attachment("a1", 1)],
    pageInfo: { hasNextPage: true, endCursor: "attachment-cursor" },
  },
}

const requestOf = (body: RequestBody): string => body.query

describe("the working-set read", () => {
  test("reads three refs in one list request", async () => {
    const requests: RequestBody[] = []
    const handler = (request: Parameters<typeof readBody>[0]): Response => {
      const body = readBody(request)
      requests.push(body)
      const second = { ...node, id: issueId("issue-RAT-2"), identifier: "RAT-2" }
      const third = { ...node, id: issueId("issue-RAT-3"), identifier: "RAT-3" }
      return jsonResponse({
        data: {
          issues: {
            nodes: [
              { ...node, attachments: { nodes: [], pageInfo } },
              { ...second, attachments: { nodes: [], pageInfo } },
              { ...third, attachments: { nodes: [], pageInfo } },
            ],
            pageInfo: { hasNextPage: false, endCursor: null },
          },
        },
      })
    }

    const page = await run(
      handler,
      Effect.gen(function* readWorkingSet() {
        const reader = yield* IssueReader
        return yield* reader.workingSet(["RAT-1", "RAT-2", "RAT-3"], {
          comments: false,
          mode: "working",
        })
      }),
    )

    expect(requests).toHaveLength(1)
    expect(requests[0]?.query).toContain("query IssueWorkingSet")
    expect(requests[0]?.variables.filter).toEqual({
      id: { in: ["RAT-1", "RAT-2", "RAT-3"] },
    })
    expect(requests[0]?.variables.first).toBe(5)
    expect(page.items.map((item) => item.identifier)).toEqual(["RAT-1", "RAT-2", "RAT-3"])
  })

  test("paginates a nested attachment connection in one connection request", async () => {
    const requests: RequestBody[] = []
    const handler = (request: Parameters<typeof readBody>[0]): Response => {
      const body = readBody(request)
      requests.push(body)
      const query = requestOf(body)
      if (query.includes("query IssueWorkingAttachments")) {
        return jsonResponse({
          data: {
            issue0: {
              attachments: {
                nodes: [attachment("a2", 2)],
                pageInfo: { hasNextPage: false, endCursor: null },
              },
            },
          },
        })
      }
      expect(query).toContain("query IssueWorkingSet")
      return jsonResponse({
        data: { issues: { nodes: [node], pageInfo: { hasNextPage: false, endCursor: null } } },
      })
    }

    const page = await run(
      handler,
      Effect.gen(function* readWorkingSet() {
        const reader = yield* IssueReader
        return yield* reader.workingSet(["RAT-1"], { comments: false, mode: "working" })
      }),
    )

    expect(requests).toHaveLength(2)
    expect(requests[0]?.query).toContain("query IssueWorkingSet")
    expect(requests[1]?.query).toContain("query IssueWorkingAttachments")
    expect(requests[1]?.variables).toEqual({
      id0: issueId("issue-RAT-1"),
      after0: "attachment-cursor",
    })
    const item = page.items[0]
    expect(item !== undefined && "prs" in item ? item.prs.map((pr) => pr.number) : []).toEqual([
      1, 2,
    ])
  })
})
