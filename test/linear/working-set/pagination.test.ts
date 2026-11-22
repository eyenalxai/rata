import type { RequestBody } from "@test/issue-fixtures"

import { jsonResponse, pageInfo, readBody, run } from "@test/issue-fixtures"
import { attachment, comment, node, requestOf } from "@test/linear/working-set/fixtures"
import { describe, expect, test } from "bun:test"
import { Effect } from "effect"

import { issueId } from "@/domain/id"
import { IssueReader } from "@/tracker/read"

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

  test("paginates comments in one connection request", async () => {
    const requests: RequestBody[] = []
    const initial = {
      ...node,
      attachments: { nodes: [], pageInfo },
      comments: {
        nodes: Array.from({ length: 10 }, (_, index) => comment(index)),
        pageInfo: { hasNextPage: true, endCursor: "comments-1" },
      },
    }
    const handler = (request: Parameters<typeof readBody>[0]): Response => {
      const body = readBody(request)
      requests.push(body)
      if (requestOf(body).includes("query IssueWorkingComments")) {
        return jsonResponse({
          data: {
            issue0: {
              comments: {
                nodes: [comment(10), comment(11)],
                pageInfo: { hasNextPage: false, endCursor: null },
              },
            },
          },
        })
      }
      return jsonResponse({
        data: { issues: { nodes: [initial], pageInfo: { hasNextPage: false, endCursor: null } } },
      })
    }

    const page = await run(
      handler,
      Effect.gen(function* readWorkingSet() {
        const reader = yield* IssueReader
        return yield* reader.workingSet(["RAT-1"], { comments: true, mode: "working" })
      }),
    )

    expect(requests).toHaveLength(2)
    const item = page.items[0]
    if (item === undefined || !("comments" in item)) {
      throw new Error("expected comments")
    }
    expect(item.comments).toHaveLength(12)
  })

  test("drains refs across more than one list page", async () => {
    const requests: RequestBody[] = []
    const handler = (request: Parameters<typeof readBody>[0]): Response => {
      const body = readBody(request)
      requests.push(body)
      const first = body.variables.after === null
      const nodes = first
        ? Array.from({ length: 5 }, (_, index) => ({
            ...node,
            id: issueId(`issue-RAT-${10 + index}`),
            identifier: `RAT-${10 + index}`,
            attachments: { nodes: [], pageInfo },
          }))
        : [
            {
              ...node,
              id: issueId("issue-RAT-15"),
              identifier: "RAT-15",
              attachments: { nodes: [], pageInfo },
            },
          ]
      return jsonResponse({
        data: {
          issues: {
            nodes,
            pageInfo: first
              ? { hasNextPage: true, endCursor: "issue-RAT-14" }
              : { hasNextPage: false, endCursor: "issue-RAT-15" },
          },
        },
      })
    }

    const page = await run(
      handler,
      Effect.gen(function* readWorkingSet() {
        const reader = yield* IssueReader
        return yield* reader.workingSet(
          ["RAT-10", "RAT-11", "RAT-12", "RAT-13", "RAT-14", "RAT-15"],
          { comments: false, mode: "working" },
        )
      }),
    )

    expect(requests).toHaveLength(2)
    expect(page.items.map((item) => item.identifier)).toEqual([
      "RAT-10",
      "RAT-11",
      "RAT-12",
      "RAT-13",
      "RAT-14",
      "RAT-15",
    ])
  })
})
