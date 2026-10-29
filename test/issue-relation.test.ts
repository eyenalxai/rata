import { inputOf } from "@test/fake-linear/model"
import { jsonResponse, pageInfo } from "@test/issue-fixtures"
import { makeRecorder, run as runWrite } from "@test/issue-write/fixtures"
import { describe, expect, test } from "bun:test"
import { Effect } from "effect"

import type { IssueInverseRelation, IssueRelation } from "@/api/issue-schema"

import { IssueWriteApi } from "@/api/issue-write"

const issueIds =
  (ids: Readonly<Record<string, string>>) => (request: { variables: Record<string, unknown> }) =>
    jsonResponse({ data: { issue: { id: ids[String(request.variables.id)] } } })

const relationIds = { "RAT-5": "i5", "RAT-6": "i6", "RAT-7": "i7" }

const outgoingRelation: IssueRelation = {
  id: "rel-out",
  type: "blocks",
  relatedIssue: {
    id: "i7",
    identifier: "RAT-7",
    title: "Dependent",
    state: { name: "Todo", type: "unstarted" },
  },
}

const incomingRelation: IssueInverseRelation = {
  id: "rel-in",
  type: "blocks",
  issue: {
    id: "i5",
    identifier: "RAT-5",
    title: "Blocker",
    state: { name: "In Progress", type: "started" },
  },
}

const handlerFor = (
  relations: {
    readonly outgoing?: readonly IssueRelation[]
    readonly incoming?: readonly IssueInverseRelation[]
  } = {},
) =>
  makeRecorder((request) => {
    if (request.query.includes("query IssueId")) {
      return issueIds(relationIds)(request)
    }
    if (request.query.includes("query IssueRelations")) {
      return jsonResponse({
        data: {
          issue: { relations: { nodes: relations.outgoing ?? [], pageInfo } },
        },
      })
    }
    if (request.query.includes("query IssueInverseRelations")) {
      return jsonResponse({
        data: {
          issue: { inverseRelations: { nodes: relations.incoming ?? [], pageInfo } },
        },
      })
    }
    if (request.query.includes("mutation IssueRelationCreate")) {
      return jsonResponse({ data: { issueRelationCreate: { success: true } } })
    }
    if (request.query.includes("mutation IssueRelationDelete")) {
      return jsonResponse({ data: { issueRelationDelete: { success: true } } })
    }
    return jsonResponse({ errors: [{ message: `Unexpected query: ${request.query}` }] }, 400)
  })

describe("IssueWriteApi link", () => {
  test("maps --blocks and --blocked-by to the two directions of blocks", async () => {
    const recorder = handlerFor()

    const result = await runWrite(
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
    expect(result.status).toBe("updated")
    expect(result.changes).toEqual([
      { action: "created", kind: "blocks", target: "RAT-7" },
      { action: "created", kind: "blockedBy", target: "RAT-5" },
    ])
  })

  test("skips a relation that already exists", async () => {
    const recorder = handlerFor({
      outgoing: [outgoingRelation],
      incoming: [incomingRelation],
    })

    const result = await runWrite(
      recorder.handler,
      Effect.gen(function* linkExisting() {
        const api = yield* IssueWriteApi
        return yield* api.link("RAT-6", {
          blocks: ["RAT-7"],
          blockedBy: ["RAT-5"],
          related: [],
          duplicate: [],
        })
      }),
    )

    expect(
      recorder.requests.some((request) => request.query.includes("mutation IssueRelationCreate")),
    ).toBe(false)
    expect(result.status).toBe("skipped")
    expect(result.changes).toEqual([
      { action: "skipped", kind: "blocks", target: "RAT-7" },
      { action: "skipped", kind: "blockedBy", target: "RAT-5" },
    ])
  })

  test("does not create a relation on a dry run", async () => {
    const recorder = handlerFor()

    const result = await runWrite(
      recorder.handler,
      Effect.gen(function* dryRunLink() {
        const api = yield* IssueWriteApi
        return yield* api.link(
          "RAT-6",
          { blocks: ["RAT-7"], blockedBy: [], related: [], duplicate: [] },
          { dryRun: true },
        )
      }),
    )

    expect(
      recorder.requests.some((request) => request.query.includes("mutation IssueRelationCreate")),
    ).toBe(false)
    expect(result.actions).toEqual([
      {
        action: "link",
        target: "RAT-6",
        status: "updated",
        changes: { relation: "blocks", issue: "RAT-7" },
      },
    ])
  })
})

describe("IssueWriteApi unlink", () => {
  test("deletes the incoming relation for --blocked-by, not the outgoing one", async () => {
    const recorder = handlerFor({
      outgoing: [outgoingRelation],
      incoming: [incomingRelation],
    })
    const result = await runWrite(
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
    expect(result.status).toBe("updated")
    expect(result.changes).toEqual([{ action: "deleted", kind: "blockedBy", target: "RAT-5" }])
  })

  test("skips a missing relation without deleting", async () => {
    const recorder = handlerFor()

    const result = await runWrite(
      recorder.handler,
      Effect.gen(function* unlinkMissing() {
        const api = yield* IssueWriteApi
        return yield* api.unlink("RAT-6", {
          blocks: [],
          blockedBy: ["RAT-5"],
          related: [],
          duplicate: [],
        })
      }),
    )

    expect(result.status).toBe("skipped")
    expect(result.changes).toEqual([{ action: "skipped", kind: "blockedBy", target: "RAT-5" }])
    expect(
      recorder.requests.some((request) => request.query.includes("mutation IssueRelationDelete")),
    ).toBe(false)
  })

  test("does not delete a relation on a dry run", async () => {
    const recorder = handlerFor({ incoming: [incomingRelation] })

    const result = await runWrite(
      recorder.handler,
      Effect.gen(function* dryRunUnlink() {
        const api = yield* IssueWriteApi
        return yield* api.unlink(
          "RAT-6",
          { blocks: [], blockedBy: ["RAT-5"], related: [], duplicate: [] },
          { dryRun: true },
        )
      }),
    )

    expect(
      recorder.requests.some((request) => request.query.includes("mutation IssueRelationDelete")),
    ).toBe(false)
    expect(result.actions).toEqual([
      {
        action: "unlink",
        target: "RAT-6",
        status: "updated",
        changes: { relation: "blockedBy", issue: "RAT-5" },
      },
    ])
  })
})
