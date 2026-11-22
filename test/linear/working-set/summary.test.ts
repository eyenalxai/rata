import type { RequestBody } from "@test/issue-fixtures"

import { jsonResponse, readBody, run } from "@test/issue-fixtures"
import { label, node, requestOf } from "@test/linear/working-set/fixtures"
import { describe, expect, test } from "bun:test"
import { Effect } from "effect"

import { IssueReader } from "@/tracker/read"

describe("the summary read", () => {
  test("drains summary labels", async () => {
    const requests: RequestBody[] = []
    const initial = {
      ...node,
      labels: {
        nodes: Array.from({ length: 25 }, (_, index) => label(index)),
        pageInfo: { hasNextPage: true, endCursor: "labels-1" },
      },
    }
    const handler = (request: Parameters<typeof readBody>[0]): Response => {
      const body = readBody(request)
      requests.push(body)
      if (requestOf(body).includes("query IssueWorkingLabels")) {
        return jsonResponse({
          data: {
            issue0: {
              labels: {
                nodes: [label(25)],
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
        return yield* reader.workingSet(["RAT-1"], { comments: false, mode: "summary" })
      }),
    )

    expect(requests).toHaveLength(2)
    expect(page.items[0]?.labels).toHaveLength(26)
  })
})
