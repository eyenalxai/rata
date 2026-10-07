import type { HttpClientRequest } from "effect/http"

import { jsonResponse, pageInfo, readBody, run } from "@test/issue-fixtures"
import { describe, expect, test } from "bun:test"
import { Effect } from "effect"

import { IssueApi } from "@/api/issue"

const emptyIssues = (): Response => jsonResponse({ data: { issues: { nodes: [], pageInfo } } })

const listWithoutTeam = Effect.gen(function* listIssues() {
  const api = yield* IssueApi
  return yield* api.list({ after: null, limit: 50 })
})

describe("IssueApi team default", () => {
  test("filters by the linked team when no team is passed", async () => {
    const captured: Record<string, unknown>[] = []
    const handler = (request: HttpClientRequest.HttpClientRequest): Response => {
      captured.push(readBody(request).variables)
      return emptyIssues()
    }

    await run(handler, listWithoutTeam)

    expect(captured[0]?.filter).toEqual({ team: { id: { eq: "team-1" } } })
  })

  test("lets --team override the linked team", async () => {
    const captured: Record<string, unknown>[] = []
    const handler = (request: HttpClientRequest.HttpClientRequest): Response => {
      captured.push(readBody(request).variables)
      return emptyIssues()
    }

    await run(
      handler,
      Effect.gen(function* listIssues() {
        const api = yield* IssueApi
        return yield* api.list({ team: "OPS", after: null, limit: 50 })
      }),
    )

    expect(captured[0]?.filter).toEqual({ team: { id: { eq: "team-2" } } })
  })

  test("fails without a link and without a team", async () => {
    const error = await run(emptyIssues, listWithoutTeam.pipe(Effect.flip), [])

    expect(error._tag).toBe("TeamResolutionError")
    if (error._tag === "TeamResolutionError") {
      expect(error.message).toBe("No team. Pass --team, or run `rata link`.")
    }
  })
})
