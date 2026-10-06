import { inputOf } from "@test/fake-linear-model"
import { jsonResponse, pageInfo } from "@test/issue-fixtures"
import { makeRecorder, run as runWrite } from "@test/issue-write-fixtures"
import { describe, expect, test } from "bun:test"
import { Effect } from "effect"

import { IssueWriteApi } from "@/api/issue-write"

const issueIds =
  (ids: Readonly<Record<string, string>>) => (request: { variables: Record<string, unknown> }) =>
    jsonResponse({ data: { issue: { id: ids[String(request.variables.id)] } } })

const relationIds = { "RAT-5": "i5", "RAT-6": "i6", "RAT-7": "i7" }

const relations = () => ({
  outgoing: {
    nodes: [
      {
        id: "rel-out",
        type: "blocks",
        relatedIssue: {
          id: "i7",
          identifier: "RAT-7",
          title: "Dependent",
          state: { name: "Todo", type: "unstarted" },
        },
      },
    ],
    pageInfo,
  },
  incoming: {
    nodes: [
      {
        id: "rel-in",
        type: "blocks",
        issue: {
          id: "i5",
          identifier: "RAT-5",
          title: "Blocker",
          state: { name: "In Progress", type: "started" },
        },
      },
    ],
    pageInfo,
  },
})

const handlerFor = () =>
  makeRecorder((request) => {
    if (request.query.includes("query IssueId")) {
      return issueIds(relationIds)(request)
    }
    if (request.query.includes("query IssueRelations")) {
      return jsonResponse({ data: { issue: { relations: relations().outgoing } } })
    }
    if (request.query.includes("query IssueInverseRelations")) {
      return jsonResponse({ data: { issue: { inverseRelations: relations().incoming } } })
    }
    if (request.query.includes("mutation IssueRelationDelete")) {
      return jsonResponse({ data: { issueRelationDelete: { success: true } } })
    }
    return jsonResponse({ errors: [{ message: `Unexpected query: ${request.query}` }] }, 400)
  })

describe("IssueWriteApi link", () => {
  test("maps --blocks and --blocked-by to the two directions of blocks", async () => {
    const recorder = makeRecorder((request) => {
      if (request.query.includes("query IssueId")) {
        return issueIds(relationIds)(request)
      }
      if (request.query.includes("mutation IssueRelationCreate")) {
        return jsonResponse({ data: { issueRelationCreate: { success: true } } })
      }
      return jsonResponse({ errors: [{ message: `Unexpected query: ${request.query}` }] }, 400)
    })

    const applied = await runWrite(
      recorder.handler,
      Effect.gen(function* linkIssue() {
        const api = yield* IssueWriteApi
        return yield* api.link("RAT-6", {
          blocks: ["RAT-7"],
          blockedBy: ["RAT-5"],
          related: [],
          duplicate: [],
        })
      }),
    )

    const creates = recorder.requests.filter((request) =>
      request.query.includes("mutation IssueRelationCreate"),
    )
    expect(creates.map((request) => inputOf(request.variables))).toEqual([
      { issueId: "i6", relatedIssueId: "i7", type: "blocks" },
      { issueId: "i5", relatedIssueId: "i6", type: "blocks" },
    ])
    expect(applied).toEqual([
      { action: "created", kind: "blocks", target: "RAT-7" },
      { action: "created", kind: "blockedBy", target: "RAT-5" },
    ])
  })
})

describe("IssueWriteApi unlink", () => {
  test("deletes the incoming relation for --blocked-by, not the outgoing one", async () => {
    const recorder = handlerFor()
    const applied = await runWrite(
      recorder.handler,
      Effect.gen(function* unlinkIssue() {
        const api = yield* IssueWriteApi
        return yield* api.unlink("RAT-6", {
          blocks: [],
          blockedBy: ["RAT-5"],
          related: [],
          duplicate: [],
        })
      }),
    )

    const deletes = recorder.requests.filter((request) =>
      request.query.includes("mutation IssueRelationDelete"),
    )
    expect(deletes.map((request) => request.variables)).toEqual([{ id: "rel-in" }])
    expect(applied).toEqual([{ action: "deleted", kind: "blockedBy", target: "RAT-5" }])
  })

  test("fails without deleting when the relation is missing", async () => {
    const recorder = makeRecorder((request) => {
      if (request.query.includes("query IssueId")) {
        return issueIds(relationIds)(request)
      }
      if (request.query.includes("query IssueRelations")) {
        return jsonResponse({ data: { issue: { relations: { nodes: [], pageInfo } } } })
      }
      if (request.query.includes("query IssueInverseRelations")) {
        return jsonResponse({ data: { issue: { inverseRelations: { nodes: [], pageInfo } } } })
      }
      return jsonResponse({ errors: [{ message: `Unexpected query: ${request.query}` }] }, 400)
    })

    const error = await runWrite(
      recorder.handler,
      Effect.gen(function* unlinkMissing() {
        const api = yield* IssueWriteApi
        return yield* Effect.flip(
          api.unlink("RAT-6", {
            blocks: [],
            blockedBy: ["RAT-5"],
            related: [],
            duplicate: [],
          }),
        )
      }),
    )

    expect(error._tag).toBe("RelationNotFoundError")
    expect(
      recorder.requests.some((request) => request.query.includes("mutation IssueRelationDelete")),
    ).toBe(false)
  })
})
