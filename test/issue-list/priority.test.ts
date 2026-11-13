import type { HttpClientRequest } from "effect/http"

import { jsonResponse, pageInfo, readBody, run, summaryNode } from "@test/issue-fixtures"
import { describe, expect, test } from "bun:test"
import { Effect } from "effect"

import { IssueApi } from "@/api/issue"

const prioritySort = [
  {
    priority: {
      order: "Ascending",
      noPriorityFirst: false,
      usePrioritySortOrderTiebreaker: false,
    },
  },
  { createdAt: { order: "Ascending" } },
]

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

    expect(captured[0]?.filter).toEqual({
      and: [{ team: { id: { eq: "team-1" } } }, { priority: { eq: 0 } }],
    })
  })

  test("sends the server sort with the createdAt tie key and reads one page", async () => {
    const queries: string[] = []
    const requests: Record<string, unknown>[] = []
    const handler = (request: HttpClientRequest.HttpClientRequest): Response => {
      const body = readBody(request)
      queries.push(body.query)
      requests.push(body.variables)
      return jsonResponse({
        data: {
          issues: {
            nodes: [
              { ...summaryNode("RAT-1"), priority: 4, createdAt: "2026-01-05T00:00:00.000Z" },
              { ...summaryNode("RAT-2"), priority: 1, createdAt: "2026-01-05T00:00:00.000Z" },
              { ...summaryNode("RAT-3"), priority: 2, createdAt: "2026-01-04T00:00:00.000Z" },
              { ...summaryNode("RAT-4"), priority: 2, createdAt: "2026-01-02T00:00:00.000Z" },
              { ...summaryNode("RAT-5"), priority: 0, createdAt: "2026-01-05T00:00:00.000Z" },
            ],
            pageInfo: { hasNextPage: true, endCursor: "cursor-1" },
          },
        },
      })
    }

    const page = await run(
      handler,
      Effect.gen(function* listIssues() {
        const api = yield* IssueApi
        return yield* api.list({ sort: "priority", after: null, limit: 50 })
      }),
    )

    expect(page.issues.map((issue) => issue.identifier)).toEqual([
      "RAT-2",
      "RAT-4",
      "RAT-3",
      "RAT-1",
      "RAT-5",
    ])
    expect(page.pageInfo).toEqual({ hasNextPage: true, endCursor: "cursor-1" })
    expect(requests).toHaveLength(1)
    expect(requests[0]?.sort).toEqual(prioritySort)
    expect(queries[0]).toContain("sort: $sort")
    expect(queries[0]).not.toContain("orderBy: createdAt")
  })

  test("drains every page with --all and sorts the whole set", async () => {
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
      const response = pages[calls]
      calls += 1
      if (response === undefined) {
        throw new Error("Unexpected extra page request.")
      }
      return jsonResponse({ data: { issues: response } })
    }

    const page = await run(
      handler,
      Effect.gen(function* listIssues() {
        const api = yield* IssueApi
        return yield* api.list({ sort: "priority", all: true, after: null, limit: 1 })
      }),
    )

    expect(page.issues.map((issue) => issue.identifier)).toEqual(["RAT-2", "RAT-1"])
    expect(page.pageInfo).toEqual({ hasNextPage: false, endCursor: null })
    expect(requests).toHaveLength(2)
    expect(requests.map((variables) => variables.sort)).toEqual([prioritySort, prioritySort])
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
    expect(requests[0]?.sort).toEqual(prioritySort)
    expect(requests[0]?.filter).toEqual({
      and: [
        { team: { id: { eq: "team-1" } } },
        { hasBlockedByRelations: { eq: false } },
        { state: { type: { nin: ["completed", "canceled"] } } },
      ],
    })
  })
})
