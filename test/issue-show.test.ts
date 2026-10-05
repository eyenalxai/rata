import type { HttpClientRequest } from "effect/http"

import {
  baseDetail,
  jsonResponse,
  pageInfo,
  readBody,
  respondWithDetail,
  run,
  user,
  uuid,
} from "@test/issue-fixtures"
import { describe, expect, test } from "bun:test"
import { Effect } from "effect"

import { IssueApi } from "@/api/issue"

const showRef = (ref: string) =>
  Effect.gen(function* showIssue() {
    const api = yield* IssueApi
    return yield* api.show(ref, { comments: false })
  })

describe("IssueApi show", () => {
  test("resolves identifier, UUID and URL references", async () => {
    const captured: Record<string, unknown>[] = []
    const handler = (request: HttpClientRequest.HttpClientRequest): Response => {
      captured.push(readBody(request).variables)
      return jsonResponse({ data: { issue: baseDetail } })
    }

    await run(handler, showRef("RAT-42"))
    await run(handler, showRef(uuid))
    await run(handler, showRef("https://linear.app/eyenalx/issue/RAT-42/some-slug"))

    expect(captured.map((variables) => variables.id)).toEqual(["RAT-42", uuid, "RAT-42"])
  })

  test("rejects an invalid issue reference", async () => {
    const error = await run(
      respondWithDetail,
      Effect.gen(function* showInvalidIssue() {
        const api = yield* IssueApi
        return yield* Effect.flip(api.show("not-an-issue", { comments: false }))
      }),
    )

    expect(error._tag).toBe("InvalidIssueRef")
  })

  test("includes comments in chronological order with --comments", async () => {
    const early = { id: "c1", body: "First", createdAt: "2026-01-01T10:00:00.000Z", user }
    const late = { id: "c2", body: "Second", createdAt: "2026-01-02T10:00:00.000Z", user }
    const handler = (request: HttpClientRequest.HttpClientRequest): Response => {
      const body = readBody(request)
      if (body.query.includes("query IssueComments")) {
        return jsonResponse({
          data: { issue: { comments: { nodes: [late, early], pageInfo } } },
        })
      }
      return jsonResponse({ data: { issue: baseDetail } })
    }

    const issue = await run(
      handler,
      Effect.gen(function* showWithComments() {
        const api = yield* IssueApi
        return yield* api.show("RAT-1", { comments: true })
      }),
    )

    expect(issue.comments?.map((comment) => comment.id)).toEqual(["c1", "c2"])
  })

  test("exposes blocking relations in both directions", async () => {
    const blocker = {
      id: "i9",
      identifier: "RAT-9",
      title: "Blocker",
      state: { name: "Done", type: "completed" },
    }
    const dependent = {
      id: "i8",
      identifier: "RAT-8",
      title: "Dependent",
      state: { name: "Todo", type: "unstarted" },
    }
    const handler = (): Response =>
      jsonResponse({
        data: {
          issue: {
            ...baseDetail,
            relations: { nodes: [{ type: "blocks", relatedIssue: dependent }], pageInfo },
            inverseRelations: { nodes: [{ type: "blocks", issue: blocker }], pageInfo },
          },
        },
      })

    const issue = await run(
      handler,
      Effect.gen(function* showIssue() {
        const api = yield* IssueApi
        return yield* api.show("RAT-1", { comments: false })
      }),
    )

    expect(issue.relations.blocks.map((target) => target.identifier)).toEqual(["RAT-8"])
    expect(issue.relations.blockedBy.map((target) => target.identifier)).toEqual(["RAT-9"])
  })
})
