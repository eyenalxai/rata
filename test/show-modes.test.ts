import type { Handler } from "@test/fake-linear/model"
import type { HttpClientRequest } from "effect/http"

import { cliLayer, lastJson } from "@test/cli-harness"
import {
  attachment,
  baseDetail,
  jsonResponse,
  pageInfo,
  readBody,
  summaryNode,
  user,
} from "@test/issue-fixtures"
import { afterEach, describe, expect, test } from "bun:test"
import { Effect, Option, Schema } from "effect"
import { Command } from "effect/cli"

import { issueCommand } from "@/cli/issue"

const comment = { id: "c1", body: "First", createdAt: "2026-01-01T10:00:00.000Z", user }

const dependent = {
  id: "i8",
  identifier: "RAT-8",
  title: "Dependent",
  state: { name: "Todo", type: "unstarted" },
}

const relatedDetail = {
  ...baseDetail,
  relations: {
    nodes: [{ id: "rel-1", type: "blocks", relatedIssue: dependent }],
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

const summaryHandler = (): Response => jsonResponse({ data: { issue: summaryNode("RAT-1") } })

const runShow = (handler: Handler, args: readonly string[], lines: string[]) =>
  Command.run(issueCommand, { version: "test" }).pipe(
    Effect.provide(cliLayer(handler, args, lines)),
    Effect.runPromise,
  )

const AnyShowDocument = Schema.Struct({
  issue: Schema.Record(Schema.String, Schema.Unknown),
})

const ErrorEnvelope = Schema.Struct({ error: Schema.Struct({ code: Schema.String }) })

const documentOf = (lines: readonly string[]) =>
  Option.getOrThrow(Schema.decodeUnknownOption(AnyShowDocument)(lastJson(lines)))

afterEach(() => {
  process.exitCode = 0
})

describe("issue show output modes", () => {
  test("--summary returns the lean document and skips the connections", async () => {
    const requests: ReturnType<typeof readBody>[] = []
    const handler = (request: HttpClientRequest.HttpClientRequest): Response => {
      const body = readBody(request)
      requests.push(body)
      return jsonResponse({ data: { issue: summaryNode("RAT-1") } })
    }
    const lines: string[] = []
    await runShow(handler, ["show", "RAT-1", "--summary", "--json"], lines)

    const document = documentOf(lines)
    expect(Object.keys(document.issue).toSorted()).toEqual([
      "assignee",
      "id",
      "identifier",
      "labels",
      "parent",
      "priority",
      "project",
      "state",
      "title",
      "updatedAt",
      "url",
    ])
    expect(requests).toHaveLength(1)
    expect(requests[0]?.query).toContain("query IssueSummary")
  })

  test("hints the valid paths at the failing level of --fields", async () => {
    const lines: string[] = []
    await runShow(
      summaryHandler,
      ["show", "RAT-1", "--summary", "--json", "--fields", "state.nope"],
      lines,
    )
    const error = Option.getOrThrow(
      Schema.decodeUnknownOption(
        Schema.Struct({ error: Schema.Struct({ code: Schema.String, hint: Schema.String }) }),
      )(lastJson(lines)),
    )
    expect(error.error.code).toBe("validation")
    expect(error.error.hint).toBe("Valid paths: name, type.")
  })

  test("--no-body omits the description but keeps the full read", async () => {
    const requests: ReturnType<typeof readBody>[] = []
    const lines: string[] = []
    await runShow(showHandler(requests), ["show", "RAT-1", "--json", "--no-body"], lines)

    const document = documentOf(lines)
    expect(document.issue).not.toHaveProperty("description")
    expect(document.issue).toHaveProperty("children")
    expect(requests.some((request) => request.query.includes("query IssueShow"))).toBe(true)
  })

  test("--summary human output prints the header without the body", async () => {
    const lines: string[] = []
    await runShow(summaryHandler, ["show", "RAT-1", "--summary"], lines)

    const output = lines.join("\n")
    expect(output).toContain("RAT-1: Title RAT-1")
    expect(output).toContain("url: https://linear.app/eyenalx/issue/RAT-1/title")
    expect(output).toContain("updatedAt: 2026-01-01T09:00:00.000Z")
    expect(output).not.toContain("Body")
  })

  test("--no-body human output omits the body and keeps the connections", async () => {
    const requests: ReturnType<typeof readBody>[] = []
    const lines: string[] = []
    await runShow(showHandler(requests), ["show", "RAT-1", "--no-body"], lines)

    const output = lines.join("\n")
    expect(output).not.toContain("Body")
    expect(output).toContain("children:")
  })

  test("--no-relations --comments keeps the body, children, attachments and comments", async () => {
    const requests: ReturnType<typeof readBody>[] = []
    const lines: string[] = []
    await runShow(
      showHandler(requests),
      ["show", "RAT-1", "--json", "--no-relations", "--comments"],
      lines,
    )

    const document = documentOf(lines)
    expect(document.issue).not.toHaveProperty("relations")
    expect(document.issue).toHaveProperty("children")
    expect(document.issue).toHaveProperty("attachments")
    expect(document.issue).toHaveProperty("comments")
    expect(requests.some((request) => request.query.includes("query IssueRelations"))).toBe(false)
    expect(requests.some((request) => request.query.includes("query IssueInverseRelations"))).toBe(
      false,
    )
    expect(requests.some((request) => request.query.includes("query IssueComments"))).toBe(true)
    const showRequest = requests.find((request) => request.query.includes("query IssueShow"))
    expect(showRequest?.query).not.toContain("relations(")
  })

  test("--no-children and --no-attachments skip their fetches", async () => {
    const requests: ReturnType<typeof readBody>[] = []
    const lines: string[] = []
    await runShow(
      showHandler(requests),
      ["show", "RAT-1", "--json", "--no-children", "--no-attachments"],
      lines,
    )

    const document = documentOf(lines)
    expect(document.issue).not.toHaveProperty("children")
    expect(document.issue).not.toHaveProperty("attachments")
    expect(requests.some((request) => request.query.includes("query IssueChildren"))).toBe(false)
    expect(requests.some((request) => request.query.includes("query IssueAttachments"))).toBe(false)
    const showRequest = requests.find((request) => request.query.includes("query IssueShow"))
    expect(showRequest?.query).not.toContain("children(")
    expect(showRequest?.query).not.toContain("attachments(")
  })

  test("rejects --summary with --comments before any fetch", async () => {
    const requests: ReturnType<typeof readBody>[] = []
    const lines: string[] = []
    await runShow(
      showHandler(requests),
      ["show", "RAT-1", "--json", "--summary", "--comments"],
      lines,
    )

    expect(
      Option.getOrThrow(Schema.decodeUnknownOption(ErrorEnvelope)(lastJson(lines))).error.code,
    ).toBe("validation")
    expect(requests).toEqual([])
    expect(process.exitCode).toBe(2)
  })

  test("view is an alias for show", async () => {
    const requests: ReturnType<typeof readBody>[] = []
    const lines: string[] = []
    await runShow(showHandler(requests), ["view", "RAT-1", "--json"], lines)

    expect(documentOf(lines).issue.identifier).toBe("RAT-1")
  })

  test("help lists the view alias", async () => {
    const lines: string[] = []
    await runShow(showHandler([]), ["--help"], lines)

    expect(lines.join("\n")).toContain("show, view")
  })
})
