import { jsonResponse, pageInfo } from "@test/issue-fixtures"
import { makeRecorder, run as runWrite } from "@test/issue-write/fixtures"
import { describe, expect, test } from "bun:test"
import { Effect } from "effect"

import { IssueWriteApi } from "@/api/issue-write"

const relationIds = { "RAT-5": "i5", "RAT-6": "i6", "RAT-7": "i7", "RAT-8": "i8" }

const refNodes = Object.entries(relationIds).map(([identifier, id]) => ({ id, identifier }))

const handlerFor = () =>
  makeRecorder((request) => {
    if (request.query.includes("query IssueRefs")) {
      return jsonResponse({ data: { issues: { nodes: refNodes, pageInfo } } })
    }
    if (request.query.includes("query IssueRelationsWithInverse")) {
      return jsonResponse({
        data: {
          issue: {
            relations: { nodes: [], pageInfo },
            inverseRelations: { nodes: [], pageInfo },
          },
        },
      })
    }
    return jsonResponse({ errors: [{ message: `Unexpected query: ${request.query}` }] }, 400)
  })

describe("IssueWriteApi link request count", () => {
  test("resolves one and three targets in two requests", async () => {
    const cases = [
      {
        changes: { blocks: ["RAT-7"], blockedBy: [], related: [], duplicate: [] },
        refs: ["RAT-6", "RAT-7"],
      },
      {
        changes: { blocks: ["RAT-7"], blockedBy: ["RAT-5"], related: ["RAT-8"], duplicate: [] },
        refs: ["RAT-6", "RAT-7", "RAT-5", "RAT-8"],
      },
    ]
    const results = await Promise.all(
      cases.map(async (entry) => {
        const recorder = handlerFor()
        await runWrite(
          recorder.handler,
          Effect.gen(function* countTargets() {
            const api = yield* IssueWriteApi
            return yield* api.link("RAT-6", entry.changes, { dryRun: true })
          }),
        )
        return recorder.requests
      }),
    )

    for (const requests of results) {
      expect(requests).toHaveLength(2)
      expect(requests[0]?.query).toContain("query IssueRefs")
      expect(requests[1]?.query).toContain("query IssueRelationsWithInverse")
    }
    expect(results.map((requests) => requests[0]?.variables.filter)).toEqual(
      cases.map((entry) => ({ id: { in: entry.refs } })),
    )
  })

  test("leaves a UUID out of the id query", async () => {
    const source = "5f0c1f2a-3b4c-4d5e-8f90-1234567890ab"
    const uuidTarget = "6f0c1f2a-3b4c-4d5e-8f90-1234567890ab"
    const cases = [
      { target: uuidTarget, refs: [] },
      { target: "RAT-7", refs: ["RAT-7"] },
    ]
    const results = await Promise.all(
      cases.map(async (entry) => {
        const recorder = handlerFor()
        await runWrite(
          recorder.handler,
          Effect.gen(function* skipUuidRef() {
            const api = yield* IssueWriteApi
            return yield* api.link(
              source,
              { blocks: [entry.target], blockedBy: [], related: [], duplicate: [] },
              { dryRun: true },
            )
          }),
        )
        return recorder.requests
      }),
    )

    for (const [index, requests] of results.entries()) {
      const refs = cases[index]?.refs ?? []
      expect(requests).toHaveLength(refs.length === 0 ? 1 : 2)
      if (refs.length > 0) {
        expect(requests[0]?.variables.filter).toEqual({ id: { in: refs } })
      }
    }
  })
})
