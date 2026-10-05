import type { HttpClientRequest } from "effect/http"

import { inputOf } from "@test/fake-linear"
import {
  jsonResponse,
  pageInfo,
  readBody,
  run as runIssue,
  summaryNode,
  user,
} from "@test/issue-fixtures"
import { makeRecorder, run as runWrite } from "@test/issue-write-fixtures"
import { describe, expect, test } from "bun:test"
import { Effect } from "effect"

import { IssueApi } from "@/api/issue"
import { IssueWriteApi } from "@/api/issue-write"
import { isUnblocked } from "@/domain/frontier"

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

const blockerNode = (identifier: string, type: string) => ({
  id: `id-${identifier}`,
  identifier,
  title: `Title ${identifier}`,
  state: { name: type, type },
})

const blockedBy = (...blockers: readonly ReturnType<typeof blockerNode>[]) => ({
  nodes: blockers.map((issue, index) => ({ id: `rel-${index}`, type: "blocks", issue })),
  pageInfo,
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

describe("frontier", () => {
  test("counts completed and canceled blockers as closed", () => {
    const open = { state: { type: "started" } }
    const completed = { state: { type: "completed" } }
    const canceled = { state: { type: "canceled" } }
    const backlog = { state: { type: "backlog" } }

    expect(isUnblocked({ state: open.state, blockers: [] })).toBe(true)
    expect(isUnblocked({ state: open.state, blockers: [completed, canceled] })).toBe(true)
    expect(isUnblocked({ state: open.state, blockers: [completed, backlog] })).toBe(false)
    expect(isUnblocked({ state: completed.state, blockers: [] })).toBe(false)
  })

  test("list --parent --unblocked --unassigned keeps only the frontier", async () => {
    const captured: Record<string, unknown>[] = []
    const openState = { name: "Todo", type: "unstarted" }
    const handler = (request: HttpClientRequest.HttpClientRequest): Response => {
      const body = readBody(request)
      if (body.query.includes("query IssueId")) {
        return jsonResponse({ data: { issue: { id: "map-id" } } })
      }
      if (body.query.includes("query IssueListUnblocked")) {
        captured.push(body.variables)
        return jsonResponse({
          data: {
            issues: {
              nodes: [
                {
                  ...summaryNode("RAT-1"),
                  state: openState,
                  assignee: null,
                  inverseRelations: blockedBy(),
                },
                {
                  ...summaryNode("RAT-2"),
                  state: openState,
                  assignee: null,
                  inverseRelations: blockedBy(blockerNode("RAT-9", "started")),
                },
                {
                  ...summaryNode("RAT-3"),
                  state: { name: "Done", type: "completed" },
                  assignee: null,
                  inverseRelations: blockedBy(),
                },
                {
                  ...summaryNode("RAT-4"),
                  state: openState,
                  assignee: user,
                  inverseRelations: blockedBy(),
                },
                {
                  ...summaryNode("RAT-5"),
                  state: openState,
                  assignee: null,
                  inverseRelations: blockedBy(blockerNode("RAT-8", "completed")),
                },
              ],
              pageInfo,
            },
          },
        })
      }
      return jsonResponse({ errors: [{ message: `Unexpected query: ${body.query}` }] }, 400)
    }

    const issues = await runIssue(
      handler,
      Effect.gen(function* listFrontier() {
        const api = yield* IssueApi
        return yield* api.list({
          parent: "RAT-0",
          unblocked: true,
          unassigned: true,
          limit: 50,
        })
      }),
    )

    expect(issues.map((issue) => issue.identifier)).toEqual(["RAT-1", "RAT-5"])
    expect(captured[0]?.filter).toEqual({
      and: [{ assignee: { null: true } }, { parent: { id: { eq: "map-id" } } }],
    })
  })
})
