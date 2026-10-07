import type { HttpClientRequest } from "effect/http"

import {
  jsonResponse,
  pageInfo,
  readBody,
  run,
  summaryNode,
  uuid,
  viewer,
} from "@test/issue-fixtures"
import { describe, expect, test } from "bun:test"
import { Effect } from "effect"

import { IssueApi } from "@/api/issue"

describe("IssueApi list", () => {
  test("composes every list filter, including the server-side unblocked rule", async () => {
    const captured: Record<string, unknown>[] = []
    const queries: string[] = []
    const handler = (request: HttpClientRequest.HttpClientRequest): Response => {
      const body = readBody(request)
      if (body.query.includes("query IssueId")) {
        return jsonResponse({ data: { issue: { id: "parent-uuid" } } })
      }
      if (body.query.includes("query Viewer")) {
        return jsonResponse({ data: { viewer } })
      }
      captured.push(body.variables)
      queries.push(body.query)
      return jsonResponse({ data: { issues: { nodes: [summaryNode("RAT-1")], pageInfo } } })
    }

    const page = await run(
      handler,
      Effect.gen(function* listIssues() {
        const api = yield* IssueApi
        return yield* api.list({
          team: "RAT",
          state: "In Progress",
          stateType: "started",
          priority: 1,
          label: "ready-for-agent",
          assignee: "me",
          project: "Tracker",
          parent: "RAT-0",
          text: "login",
          unblocked: true,
          unassigned: true,
          after: "cursor-before",
          limit: 50,
        })
      }),
    )

    expect(page.issues.map((issue) => issue.identifier)).toEqual(["RAT-1"])
    expect(captured).toHaveLength(1)
    expect(captured[0]?.filter).toEqual({
      and: [
        { team: { id: { eq: "team-1" } } },
        { state: { name: { eqIgnoreCase: "In Progress" } } },
        { state: { type: { eq: "started" } } },
        { priority: { eq: 1 } },
        { labels: { some: { name: { eqIgnoreCase: "ready-for-agent" } } } },
        { assignee: { id: { eq: "u1" } } },
        { assignee: { null: true } },
        { project: { name: { eqIgnoreCase: "Tracker" } } },
        { parent: { id: { eq: "parent-uuid" } } },
        {
          or: [
            { title: { containsIgnoreCase: "login" } },
            { description: { containsIgnoreCase: "login" } },
          ],
        },
        { hasBlockedByRelations: { eq: false } },
        { state: { type: { nin: ["completed", "canceled"] } } },
      ],
    })
    expect(captured[0]?.first).toBe(50)
    expect(captured[0]?.after).toBe("cursor-before")
    expect(queries[0] ?? "").toContain("orderBy: createdAt")
  })

  test("uses the team id when the value is a UUID", async () => {
    const captured: Record<string, unknown>[] = []
    const handler = (request: HttpClientRequest.HttpClientRequest): Response => {
      captured.push(readBody(request).variables)
      return jsonResponse({ data: { issues: { nodes: [], pageInfo } } })
    }

    const page = await run(
      handler,
      Effect.gen(function* listIssues() {
        const api = yield* IssueApi
        return yield* api.list({ team: uuid, after: null, limit: 50 })
      }),
    )

    expect(page.issues).toEqual([])
    expect(captured[0]?.filter).toEqual({ team: { id: { eq: uuid } } })
  })

  test("decodes the priority token on the summary records", async () => {
    const queries: string[] = []
    const handler = (request: HttpClientRequest.HttpClientRequest): Response => {
      const body = readBody(request)
      queries.push(body.query)
      return jsonResponse({
        data: {
          issues: {
            nodes: [
              { ...summaryNode("RAT-1"), priority: 1 },
              { ...summaryNode("RAT-2"), priority: 2 },
              { ...summaryNode("RAT-3"), priority: 4 },
              { ...summaryNode("RAT-4"), priority: 0 },
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
        return yield* api.list({ after: null, limit: 50 })
      }),
    )

    expect(page.issues.map((issue) => issue.priority)).toEqual(["urgent", "high", "low", "none"])
    expect(queries[0]).toContain("priority")
  })

  test("rejects an out-of-range priority from Linear", async () => {
    const queries: string[] = []
    const handler = (request: HttpClientRequest.HttpClientRequest): Response => {
      queries.push(readBody(request).query)
      return jsonResponse({
        data: { issues: { nodes: [{ ...summaryNode("RAT-1"), priority: 5 }], pageInfo } },
      })
    }

    const error = await run(
      handler,
      Effect.gen(function* listIssues() {
        const api = yield* IssueApi
        return yield* api.list({ after: null, limit: 50 })
      }).pipe(Effect.flip),
    )

    expect(error._tag).toBe("LinearGraphQLError")
    expect(error.message).toBe("Linear returned an unexpected response body.")
    expect(queries[0]).toContain("priority")
  })

  test("reads one page and returns its page info without draining", async () => {
    const requests: Record<string, unknown>[] = []
    const handler = (request: HttpClientRequest.HttpClientRequest): Response => {
      requests.push(readBody(request).variables)
      return jsonResponse({
        data: {
          issues: {
            nodes: [summaryNode("RAT-1"), summaryNode("RAT-2")],
            pageInfo: { hasNextPage: true, endCursor: "cursor-1" },
          },
        },
      })
    }

    const page = await run(
      handler,
      Effect.gen(function* listIssues() {
        const api = yield* IssueApi
        return yield* api.list({ limit: 2, after: "cursor-0" })
      }),
    )

    expect(page.issues.map((issue) => issue.identifier)).toEqual(["RAT-1", "RAT-2"])
    expect(page.pageInfo).toEqual({ hasNextPage: true, endCursor: "cursor-1" })
    expect(requests).toHaveLength(1)
    expect(requests[0]?.first).toBe(2)
    expect(requests[0]?.after).toBe("cursor-0")
  })

  test("keeps the unblocked filter when it continues from a cursor", async () => {
    const captured: Record<string, unknown>[] = []
    const handler = (request: HttpClientRequest.HttpClientRequest): Response => {
      captured.push(readBody(request).variables)
      return jsonResponse({
        data: {
          issues: {
            nodes: [summaryNode("RAT-1")],
            pageInfo: { hasNextPage: true, endCursor: "cursor-1" },
          },
        },
      })
    }

    await run(
      handler,
      Effect.gen(function* listUnblockedPages() {
        const api = yield* IssueApi
        const first = yield* api.list({ unblocked: true, unassigned: true, after: null, limit: 1 })
        const cursor = first.pageInfo.endCursor
        if (cursor === null) {
          return
        }
        yield* api.list({ unblocked: true, unassigned: true, after: cursor, limit: 1 })
      }),
    )

    const unblocked = [
      { hasBlockedByRelations: { eq: false } },
      { state: { type: { nin: ["completed", "canceled"] } } },
    ]
    expect(captured).toHaveLength(2)
    const teamFilter = { team: { id: { eq: "team-1" } } }
    expect(captured[0]?.filter).toEqual({
      and: [teamFilter, { assignee: { null: true } }, ...unblocked],
    })
    expect(captured[1]?.filter).toEqual({
      and: [teamFilter, { assignee: { null: true } }, ...unblocked],
    })
    expect(captured[0]?.after).toBeNull()
    expect(captured[1]?.after).toBe("cursor-1")
    expect(captured[1]?.first).toBe(1)
  })
})

describe("IssueApi search", () => {
  test("reads one relevance-ranked page and passes the cursor", async () => {
    const captured: Record<string, unknown>[] = []
    const queries: string[] = []
    const handler = (request: HttpClientRequest.HttpClientRequest): Response => {
      const body = readBody(request)
      captured.push(body.variables)
      queries.push(body.query)
      return jsonResponse({
        data: {
          searchIssues: {
            nodes: [summaryNode("RAT-1")],
            pageInfo: { hasNextPage: true, endCursor: "cursor-1" },
          },
        },
      })
    }

    const page = await run(
      handler,
      Effect.gen(function* searchIssues() {
        const api = yield* IssueApi
        return yield* api.search("login", { after: "cursor-0", limit: 10 })
      }),
    )

    expect(page.issues.map((issue) => issue.identifier)).toEqual(["RAT-1"])
    expect(page.pageInfo).toEqual({ hasNextPage: true, endCursor: "cursor-1" })
    expect(captured).toEqual([
      {
        term: "login",
        filter: { team: { id: { eq: "team-1" } } },
        first: 10,
        after: "cursor-0",
      },
    ])
    expect(queries[0] ?? "").not.toContain("orderBy")
  })
})
