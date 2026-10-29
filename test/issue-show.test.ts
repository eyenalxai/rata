import type { Handler } from "@test/fake-linear/model"
import type { HttpClientRequest } from "effect/http"

import { cliLayer, lastJson } from "@test/cli-harness"
import {
  attachment,
  baseDetail,
  jsonResponse,
  pageInfo,
  readBody,
  run,
  user,
  uuid,
} from "@test/issue-fixtures"
import { afterEach, describe, expect, test } from "bun:test"
import { Effect, Option, Schema } from "effect"
import { Command } from "effect/cli"

import { IssueApi } from "@/api/issue"
import { issueCommand } from "@/cli/issue"

const showRef = (ref: string) =>
  Effect.gen(function* showIssue() {
    const api = yield* IssueApi
    return yield* api.show(ref, { comments: false })
  })

const showWithComments = Effect.gen(function* showIssue() {
  const api = yield* IssueApi
  return yield* api.show("RAT-1", { comments: true })
})

const runShow = (handler: Handler, args: readonly string[], lines: string[]) =>
  Command.run(issueCommand, { version: "test" }).pipe(
    Effect.provide(cliLayer(handler, args, lines)),
    Effect.runPromise,
  )

const comment = { id: "c1", body: "First", createdAt: "2026-01-01T10:00:00.000Z", user }

const dependent = {
  id: "i8",
  identifier: "RAT-8",
  title: "Dependent",
  state: { name: "Todo", type: "unstarted" },
}

const blocker = {
  id: "i9",
  identifier: "RAT-9",
  title: "Blocker",
  state: { name: "Done", type: "completed" },
}

const relatedDetail = {
  ...baseDetail,
  relations: {
    nodes: [{ id: "rel-1", type: "blocks", relatedIssue: dependent }],
    pageInfo,
  },
  inverseRelations: {
    nodes: [{ id: "rel-2", type: "blocks", issue: blocker }],
    pageInfo,
  },
  attachments: { nodes: [attachment], pageInfo },
}

const showHandler =
  (requests: ReturnType<typeof readBody>[]) =>
  (request: HttpClientRequest.HttpClientRequest): Response => {
    const body = readBody(request)
    requests.push(body)
    if (body.query.includes("query IssueComments")) {
      return jsonResponse({ data: { issue: { comments: { nodes: [comment], pageInfo } } } })
    }
    return jsonResponse({ data: { issue: relatedDetail } })
  }

const relatedHandler = (): Response => jsonResponse({ data: { issue: relatedDetail } })

const ShowDocument = Schema.Struct({
  issue: Schema.Struct({
    comments: Schema.Array(Schema.Struct({ id: Schema.String })),
    children: Schema.Array(Schema.Struct({ identifier: Schema.String })),
    relations: Schema.Struct({
      blocks: Schema.Array(Schema.Struct({ identifier: Schema.String })),
    }),
    attachments: Schema.Array(Schema.Struct({ id: Schema.String })),
  }),
})

const AnyShowDocument = Schema.Struct({
  issue: Schema.Record(Schema.String, Schema.Unknown),
})

const ErrorEnvelope = Schema.Struct({ error: Schema.Struct({ code: Schema.String }) })

afterEach(() => {
  process.exitCode = 0
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

  test("decodes the priority token on the detail record", async () => {
    const queries: string[] = []
    const handler = (request: HttpClientRequest.HttpClientRequest): Response => {
      const body = readBody(request)
      queries.push(body.query)
      return jsonResponse({ data: { issue: { ...baseDetail, priority: 1 } } })
    }

    const issue = await run(handler, showRef("RAT-1"))

    expect(issue.priority).toBe("urgent")
    expect(queries[0]).toContain("priority")
  })

  test("includes comments in chronological order when requested", async () => {
    const early = comment
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

    const issue = await run(handler, showWithComments)

    expect(issue.comments?.map((item) => item.id)).toEqual(["c1", "c2"])
  })

  test("exposes blocking relations in both directions", async () => {
    const issue = await run(relatedHandler, showRef("RAT-1"))

    expect(issue.relations.blocks.map((target) => target.identifier)).toEqual(["RAT-8"])
    expect(issue.relations.blockedBy.map((target) => target.identifier)).toEqual(["RAT-9"])
  })

  test("drains every page of attachments", async () => {
    const second = { ...attachment, id: "a2", title: "Second", url: "https://example.com/second" }
    const variables: Record<string, unknown>[] = []
    const handler = (request: HttpClientRequest.HttpClientRequest): Response => {
      const body = readBody(request)
      if (body.query.includes("query IssueAttachments")) {
        variables.push(body.variables)
        return jsonResponse({ data: { issue: { attachments: { nodes: [second], pageInfo } } } })
      }
      return jsonResponse({
        data: {
          issue: {
            ...baseDetail,
            attachments: {
              nodes: [attachment],
              pageInfo: { hasNextPage: true, endCursor: attachment.id },
            },
          },
        },
      })
    }

    const issue = await run(handler, showRef("RAT-1"))

    expect(issue.attachments.map((item) => item.id)).toEqual(["a1", "a2"])
    expect(variables).toEqual([{ id: "RAT-1", first: 50, after: attachment.id }])
  })
})

describe("issue show", () => {
  test("returns comments, children, relations and attachments in one document", async () => {
    const requests: ReturnType<typeof readBody>[] = []
    const lines: string[] = []
    await runShow(showHandler(requests), ["show", "RAT-1", "--json"], lines)

    const document = Option.getOrThrow(Schema.decodeUnknownOption(ShowDocument)(lastJson(lines)))

    expect(document.issue.comments.map((item) => item.id)).toEqual(["c1"])
    expect(document.issue.children.map((item) => item.identifier)).toEqual(["RAT-2"])
    expect(document.issue.relations.blocks.map((item) => item.identifier)).toEqual(["RAT-8"])
    expect(document.issue.attachments.map((item) => item.id)).toEqual(["a1"])
  })

  test("--no-comments omits the comments and skips the fetch", async () => {
    const requests: ReturnType<typeof readBody>[] = []
    const lines: string[] = []
    await runShow(showHandler(requests), ["show", "RAT-1", "--json", "--no-comments"], lines)

    const document = Option.getOrThrow(Schema.decodeUnknownOption(AnyShowDocument)(lastJson(lines)))
    expect(document.issue).not.toHaveProperty("comments")
    expect(requests.some((request) => request.query.includes("query IssueComments"))).toBe(false)
  })

  test("rejects --comments with --no-comments", async () => {
    const requests: ReturnType<typeof readBody>[] = []
    const lines: string[] = []
    await runShow(
      showHandler(requests),
      ["show", "RAT-1", "--json", "--comments", "--no-comments"],
      lines,
    )

    expect(
      Option.getOrThrow(Schema.decodeUnknownOption(ErrorEnvelope)(lastJson(lines))).error.code,
    ).toBe("validation")
    expect(requests).toEqual([])
    expect(process.exitCode).toBe(1)
  })
})
