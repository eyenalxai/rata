import type { RequestBody } from "@test/issue-fixtures"

import { jsonResponse, pageInfo, readBody, run } from "@test/issue-fixtures"
import { comment, node, requestOf } from "@test/linear/working-set/fixtures"
import { describe, expect, test } from "bun:test"
import { Effect } from "effect"

import { issueId } from "@/domain/id"
import { IssueReader } from "@/tracker/read"

describe("working-set comments", () => {
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

  test("does not print comments when they were not requested", async () => {
    const withComments = {
      ...node,
      attachments: { nodes: [], pageInfo },
      comments: {
        nodes: [comment(0)],
        pageInfo: { hasNextPage: false, endCursor: null },
      },
    }
    const handler = (request: Parameters<typeof readBody>[0]): Response => {
      readBody(request)
      return jsonResponse({
        data: { issues: { nodes: [withComments], pageInfo } },
      })
    }

    const page = await run(
      handler,
      Effect.gen(function* readWorkingSet() {
        const reader = yield* IssueReader
        return yield* reader.workingSet(["RAT-1"], { comments: false, mode: "working" })
      }),
    )

    const item = page.items[0]
    expect(item !== undefined && "comments" in item ? item.comments : undefined).toBeNull()
  })
})
