import type { RequestBody } from "@test/issue-fixtures"

import { jsonResponse, pageInfo, readBody, run } from "@test/issue-fixtures"
import {
  fullChild,
  incomingRelation,
  label,
  leanChild,
  member,
  node,
  outgoingRelation,
  requestOf,
} from "@test/linear/working-set/fixtures"
import { describe, expect, test } from "bun:test"
import { Effect } from "effect"

import { IssueReader } from "@/tracker/read"

describe("the working-set drain", () => {
  test("fails when a requested connection is missing", async () => {
    const { children: _children, ...withoutChildren } = node
    const handler = (request: Parameters<typeof readBody>[0]): Response => {
      readBody(request)
      return jsonResponse({
        data: {
          issues: {
            nodes: [withoutChildren],
            pageInfo: { hasNextPage: false, endCursor: null },
          },
        },
      })
    }

    const error = await run(
      handler,
      Effect.flip(
        Effect.gen(function* readWorkingSet() {
          const reader = yield* IssueReader
          return yield* reader.workingSet(["RAT-1"], { comments: false, mode: "working" })
        }),
      ),
    )

    expect(error._tag).toBe("LinearGraphQLError")
  })

  test("drains children, blockers and labels before it computes the frontier", async () => {
    const requests: RequestBody[] = []
    const initial = {
      ...node,
      labels: {
        nodes: Array.from({ length: 25 }, (_, index) => label(index)),
        pageInfo: { hasNextPage: true, endCursor: "labels-1" },
      },
      inverseRelations: {
        nodes: Array.from({ length: 25 }, (_, index) => incomingRelation(index)),
        pageInfo: { hasNextPage: true, endCursor: "inverse-1" },
      },
      children: {
        nodes: Array.from({ length: 50 }, (_, index) =>
          leanChild(`RAT-${300 + index}`, { assignee: member }),
        ),
        pageInfo: { hasNextPage: true, endCursor: "children-1" },
      },
      attachments: { nodes: [], pageInfo },
    }
    const handler = (request: Parameters<typeof readBody>[0]): Response => {
      const body = readBody(request)
      requests.push(body)
      const query = requestOf(body)
      if (query.includes("query IssueWorkingLabels")) {
        return jsonResponse({
          data: {
            issue0: {
              labels: {
                nodes: Array.from({ length: 5 }, (_, index) => label(25 + index)),
                pageInfo: { hasNextPage: false, endCursor: null },
              },
            },
          },
        })
      }
      if (query.includes("query IssueWorkingInverseRelations")) {
        return jsonResponse({
          data: {
            issue0: {
              inverseRelations: {
                nodes: [incomingRelation(99, true)],
                pageInfo: { hasNextPage: false, endCursor: null },
              },
            },
          },
        })
      }
      if (query.includes("query IssueWorkingChildren")) {
        return jsonResponse({
          data: {
            issue0: {
              children: {
                nodes: [leanChild("RAT-99", { priority: 1 })],
                pageInfo: { hasNextPage: false, endCursor: null },
              },
            },
          },
        })
      }
      return jsonResponse({
        data: { issues: { nodes: [initial], pageInfo: { hasNextPage: false, endCursor: null } } },
      })
    }

    const page = await run(
      handler,
      Effect.gen(function* readWorkingSet() {
        const reader = yield* IssueReader
        return yield* reader.workingSet(["RAT-1"], { comments: false, mode: "working" })
      }),
    )

    expect(requests).toHaveLength(4)
    const item = page.items[0]
    if (item === undefined || !("frontier" in item) || !("blockedBy" in item)) {
      throw new Error("expected the working mode")
    }
    expect(item.labels).toHaveLength(30)
    expect(item.blocked).toBe(true)
    expect(item.blockedBy).toHaveLength(26)
    expect(item.blockedBy.map((blocker) => blocker.identifier)).toContain("RAT-299")
    expect(item.frontier.map((child) => child.identifier)).toEqual(["RAT-99"])
    expect(item.nextChild?.identifier).toBe("RAT-99")
  })

  test("drains full relations and full child labels", async () => {
    const requests: RequestBody[] = []
    const initial = {
      ...node,
      labels: {
        nodes: Array.from({ length: 25 }, (_, index) => label(index)),
        pageInfo: { hasNextPage: true, endCursor: "labels-1" },
      },
      relations: {
        nodes: Array.from({ length: 25 }, (_, index) => outgoingRelation(index)),
        pageInfo: { hasNextPage: true, endCursor: "relations-1" },
      },
      children: {
        nodes: [fullChild("RAT-400")],
        pageInfo,
      },
      attachments: { nodes: [], pageInfo },
    }
    const handler = (request: Parameters<typeof readBody>[0]): Response => {
      const body = readBody(request)
      requests.push(body)
      const query = requestOf(body)
      if (query.includes("query IssueWorkingLabels")) {
        const childLabels = body.variables.after0 === "child-labels-1"
        return jsonResponse({
          data: {
            issue0: {
              labels: {
                nodes: childLabels
                  ? [label(10), label(11)]
                  : Array.from({ length: 5 }, (_, index) => label(25 + index)),
                pageInfo: { hasNextPage: false, endCursor: null },
              },
            },
          },
        })
      }
      if (query.includes("query IssueWorkingRelations")) {
        return jsonResponse({
          data: {
            issue0: {
              relations: {
                nodes: [outgoingRelation(25)],
                pageInfo: { hasNextPage: false, endCursor: null },
              },
            },
          },
        })
      }
      return jsonResponse({
        data: { issues: { nodes: [initial], pageInfo: { hasNextPage: false, endCursor: null } } },
      })
    }

    const page = await run(
      handler,
      Effect.gen(function* readWorkingSet() {
        const reader = yield* IssueReader
        return yield* reader.workingSet(["RAT-1"], { comments: false, mode: "full" })
      }),
    )

    const item = page.items[0]
    if (
      item === undefined ||
      !("relations" in item) ||
      item.relations === undefined ||
      !("children" in item)
    ) {
      throw new Error("expected the full mode")
    }
    expect(item.labels).toHaveLength(30)
    expect(item.relations.blocks).toHaveLength(26)
    const firstChild = item.children[0]
    if (firstChild === undefined || !("labels" in firstChild)) {
      throw new Error("expected a full child")
    }
    expect(firstChild.labels).toHaveLength(12)
  })
})
