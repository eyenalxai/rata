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
  test("composes every list filter", async () => {
    const captured: Record<string, unknown>[] = []
    const handler = (request: HttpClientRequest.HttpClientRequest): Response => {
      const body = readBody(request)
      if (body.query.includes("query IssueId")) {
        return jsonResponse({ data: { issue: { id: "parent-uuid" } } })
      }
      if (body.query.includes("query Viewer")) {
        return jsonResponse({ data: { viewer } })
      }
      captured.push(body.variables)
      return jsonResponse({ data: { issues: { nodes: [summaryNode("RAT-1")], pageInfo } } })
    }

    const issues = await run(
      handler,
      Effect.gen(function* listIssues() {
        const api = yield* IssueApi
        return yield* api.list({
          team: "RAT",
          state: "In Progress",
          stateType: "started",
          label: "ready-for-agent",
          assignee: "me",
          project: "Tracker",
          parent: "RAT-0",
          text: "login",
          limit: 50,
        })
      }),
    )

    expect(issues.map((issue) => issue.identifier)).toEqual(["RAT-1"])
    expect(captured).toHaveLength(1)
    expect(captured[0]?.filter).toEqual({
      and: [
        { team: { key: { eqIgnoreCase: "RAT" } } },
        { state: { name: { eqIgnoreCase: "In Progress" } } },
        { state: { type: { eq: "started" } } },
        { labels: { some: { name: { eqIgnoreCase: "ready-for-agent" } } } },
        { assignee: { id: { eq: "u1" } } },
        { project: { name: { eqIgnoreCase: "Tracker" } } },
        { parent: { id: { eq: "parent-uuid" } } },
        {
          or: [
            { title: { containsIgnoreCase: "login" } },
            { description: { containsIgnoreCase: "login" } },
          ],
        },
      ],
    })
  })

  test("uses the team id when the value is a UUID", async () => {
    const captured: Record<string, unknown>[] = []
    const handler = (request: HttpClientRequest.HttpClientRequest): Response => {
      captured.push(readBody(request).variables)
      return jsonResponse({ data: { issues: { nodes: [], pageInfo } } })
    }

    await run(
      handler,
      Effect.gen(function* listIssues() {
        const api = yield* IssueApi
        return yield* api.list({ team: uuid, limit: 50 })
      }),
    )

    expect(captured[0]?.filter).toEqual({ team: { id: { eq: uuid } } })
  })

  test("follows the cursor up to the limit", async () => {
    const requests: Record<string, unknown>[] = []
    const pages = [
      {
        nodes: [summaryNode("RAT-1"), summaryNode("RAT-2")],
        pageInfo: { hasNextPage: true, endCursor: "cursor-1" },
      },
      {
        nodes: [summaryNode("RAT-3"), summaryNode("RAT-4")],
        pageInfo: { hasNextPage: false, endCursor: null },
      },
    ]
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

    const issues = await run(
      handler,
      Effect.gen(function* listIssues() {
        const api = yield* IssueApi
        return yield* api.list({ limit: 3 })
      }),
    )

    expect(issues.map((issue) => issue.identifier)).toEqual(["RAT-1", "RAT-2", "RAT-3"])
    expect(requests).toHaveLength(2)
    expect(requests[1]?.after).toBe("cursor-1")
    expect(requests[1]?.first).toBe(1)
  })

  test("searches issues by text", async () => {
    const captured: Record<string, unknown>[] = []
    const handler = (request: HttpClientRequest.HttpClientRequest): Response => {
      captured.push(readBody(request).variables)
      return jsonResponse({
        data: { searchIssues: { nodes: [summaryNode("RAT-7")], pageInfo } },
      })
    }

    const issues = await run(
      handler,
      Effect.gen(function* searchIssues() {
        const api = yield* IssueApi
        return yield* api.search("login", 50)
      }),
    )

    expect(issues.map((issue) => issue.identifier)).toEqual(["RAT-7"])
    expect(captured[0]?.term).toBe("login")
  })
})
