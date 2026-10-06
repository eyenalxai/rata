import type { HttpClientRequest } from "effect/http"

import { jsonResponse, pageInfo, readBody, run, summaryNode } from "@test/issue-fixtures"
import { describe, expect, test } from "bun:test"
import { Effect } from "effect"

import { IssueApi } from "@/api/issue"

describe("IssueApi list priority", () => {
  test("keeps the explicit 0 for no priority in the filter", async () => {
    const captured: Record<string, unknown>[] = []
    const handler = (request: HttpClientRequest.HttpClientRequest): Response => {
      captured.push(readBody(request).variables)
      return jsonResponse({ data: { issues: { nodes: [], pageInfo } } })
    }

    await run(
      handler,
      Effect.gen(function* listIssues() {
        const api = yield* IssueApi
        return yield* api.list({ priority: 0, after: null, limit: 50 })
      }),
    )

    expect(captured[0]?.filter).toEqual({ priority: { eq: 0 } })
  })

  test("sorts priority across pages with stable ties and none last", async () => {
    const pages = [
      {
        nodes: [
          { ...summaryNode("RAT-1"), priority: 4 },
          { ...summaryNode("RAT-2"), priority: 0 },
          { ...summaryNode("RAT-3"), priority: 2 },
        ],
        pageInfo: { hasNextPage: true, endCursor: "cursor-1" },
      },
      {
        nodes: [
          { ...summaryNode("RAT-4"), priority: 2 },
          { ...summaryNode("RAT-5"), priority: 1 },
          { ...summaryNode("RAT-6"), priority: 3 },
        ],
        pageInfo: { hasNextPage: false, endCursor: null },
      },
    ]
    let calls = 0
    const handler = (): Response => {
      const page = pages[calls]
      calls += 1
      if (page === undefined) {
        throw new Error("Unexpected extra page request.")
      }
      return jsonResponse({ data: { issues: page } })
    }

    const page = await run(
      handler,
      Effect.gen(function* listIssues() {
        const api = yield* IssueApi
        return yield* api.list({ sort: "priority", after: null, limit: 50 })
      }),
    )

    expect(page.issues.map((issue) => issue.identifier)).toEqual([
      "RAT-5",
      "RAT-3",
      "RAT-4",
      "RAT-6",
      "RAT-1",
      "RAT-2",
    ])
    expect(page.pageInfo).toEqual({ hasNextPage: false, endCursor: null })
  })

  test("fetches every matching page before applying the limit", async () => {
    const pages = [
      {
        nodes: [{ ...summaryNode("RAT-1"), priority: 4 }],
        pageInfo: { hasNextPage: true, endCursor: "cursor-1" },
      },
      {
        nodes: [{ ...summaryNode("RAT-2"), priority: 1 }],
        pageInfo: { hasNextPage: false, endCursor: null },
      },
    ]
    const requests: Record<string, unknown>[] = []
    let calls = 0
    const handler = (request: HttpClientRequest.HttpClientRequest): Response => {
      requests.push(readBody(request).variables)
      const page = pages[calls]
      calls += 1
      if (page === undefined) {
        throw new Error("Unexpected extra page request.")
      }
      return jsonResponse({ data: { issues: page } })
    }

    const page = await run(
      handler,
      Effect.gen(function* listIssues() {
        const api = yield* IssueApi
        return yield* api.list({ sort: "priority", after: null, limit: 1 })
      }),
    )

    expect(page.issues.map((issue) => issue.identifier)).toEqual(["RAT-2"])
    expect(requests).toHaveLength(2)
    expect(requests[1]?.after).toBe("cursor-1")
  })

  test("composes the unblocked rule into the filter when sorting", async () => {
    const requests: Record<string, unknown>[] = []
    const handler = (request: HttpClientRequest.HttpClientRequest): Response => {
      requests.push(readBody(request).variables)
      return jsonResponse({
        data: {
          issues: {
            nodes: [
              { ...summaryNode("RAT-1"), priority: 4 },
              { ...summaryNode("RAT-2"), priority: 1 },
            ],
            pageInfo,
          },
        },
      })
    }

    const page = await run(
      handler,
      Effect.gen(function* listIssues() {
        const api = yield* IssueApi
        return yield* api.list({ unblocked: true, sort: "priority", after: null, limit: 1 })
      }),
    )

    expect(page.issues.map((issue) => issue.identifier)).toEqual(["RAT-2"])
    expect(requests[0]?.filter).toEqual({
      and: [
        { hasBlockedByRelations: { eq: false } },
        { state: { type: { nin: ["completed", "canceled"] } } },
      ],
    })
  })
})
