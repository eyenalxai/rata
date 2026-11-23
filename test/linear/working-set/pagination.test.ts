import type { RequestBody } from "@test/issue-fixtures"

import { jsonResponse, pageInfo, readBody, run } from "@test/issue-fixtures"
import { attachment, label, node, requestOf } from "@test/linear/working-set/fixtures"
import { describe, expect, test } from "bun:test"
import { Effect } from "effect"

import { issueId } from "@/domain/id"
import { IssueReader } from "@/tracker/read"

const malformedRefsHandler = (request: Parameters<typeof readBody>[0]): Response => {
  readBody(request)
  return jsonResponse({
    data: {
      issues: {
        nodes: [node],
        pageInfo: { hasNextPage: true, endCursor: null },
      },
    },
  })
}

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
      if (requestOf(body).includes("query IssueWorkingAttachments")) {
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

  test("fails when the refs page has no end cursor", async () => {
    const error = await run(
      malformedRefsHandler,
      Effect.flip(
        Effect.gen(function* readWorkingSet() {
          const reader = yield* IssueReader
          return yield* reader.workingSet(["RAT-1"], { comments: false, mode: "working" })
        }),
      ),
    )

    expect(error._tag).toBe("LinearGraphQLError")
  })

  test("drains two pending label connections in one request", async () => {
    const requests: RequestBody[] = []
    const handler = (request: Parameters<typeof readBody>[0]): Response => {
      const body = readBody(request)
      requests.push(body)
      if (requestOf(body).includes("query IssueWorkingLabels")) {
        return jsonResponse({
          data: {
            issue0: {
              labels: {
                nodes: [label(10), label(11)],
                pageInfo: { hasNextPage: false, endCursor: null },
              },
            },
            issue1: {
              labels: {
                nodes: [label(12)],
                pageInfo: { hasNextPage: false, endCursor: null },
              },
            },
          },
        })
      }
      const first = {
        ...node,
        labels: {
          nodes: [label(0)],
          pageInfo: { hasNextPage: true, endCursor: "labels-a" },
        },
        attachments: { nodes: [], pageInfo },
      }
      const second = {
        ...node,
        id: issueId("issue-RAT-2"),
        identifier: "RAT-2",
        labels: {
          nodes: [label(1)],
          pageInfo: { hasNextPage: true, endCursor: "labels-b" },
        },
        attachments: { nodes: [], pageInfo },
      }
      return jsonResponse({
        data: { issues: { nodes: [first, second], pageInfo } },
      })
    }

    const page = await run(
      handler,
      Effect.gen(function* readWorkingSet() {
        const reader = yield* IssueReader
        return yield* reader.workingSet(["RAT-1", "RAT-2"], {
          comments: false,
          mode: "working",
        })
      }),
    )

    expect(requests).toHaveLength(2)
    expect(requests[1]?.variables.id0).toBe(issueId("issue-RAT-1"))
    expect(requests[1]?.variables.id1).toBe(issueId("issue-RAT-2"))
    expect(page.items[0]?.labels).toHaveLength(3)
    expect(page.items[1]?.labels).toHaveLength(2)
  })
})
