import { lastJson, runIssue } from "@test/cli-harness"
import { jsonResponse, pageInfo, summaryNode, user } from "@test/issue-fixtures"
import { makeRecorder, requestOf, states } from "@test/issue-write/fixtures"
import { afterEach, describe, expect, test } from "bun:test"
import { Option, Schema } from "effect"

const ErrorEnvelope = Schema.Struct({
  error: Schema.Struct({ code: Schema.String }),
})

const decodeError = (value: unknown) =>
  Option.getOrThrow(Schema.decodeUnknownOption(ErrorEnvelope)(value)).error

type UpdateState = {
  description: string
  updatedAt: string
  updates: number
  comments: number
}

const updateHandler = (options: { readonly failComment?: boolean } = {}) => {
  const state: UpdateState = {
    description: "Old.",
    updatedAt: "2026-01-01T09:00:00.000Z",
    updates: 0,
    comments: 0,
  }
  const recorder = makeRecorder((request) => {
    if (request.query.includes("query IssueSummary")) {
      return jsonResponse({
        data: { issue: { ...summaryNode("RAT-1"), updatedAt: state.updatedAt } },
      })
    }
    if (request.query.includes("query IssueId")) {
      return jsonResponse({ data: { issue: { id: "i1" } } })
    }
    if (request.query.includes("query IssueStates")) {
      return jsonResponse({
        data: { issue: { team: { id: "team-1", states: { nodes: states, pageInfo } } } },
      })
    }
    if (request.query.includes("mutation UpdateIssue")) {
      state.updates += 1
      state.updatedAt = "2026-01-02T09:00:00.000Z"
      return jsonResponse({
        data: {
          issueUpdate: {
            success: true,
            issue: { ...summaryNode("RAT-1"), updatedAt: state.updatedAt },
          },
        },
      })
    }
    if (request.query.includes("mutation CreateComment")) {
      state.comments += 1
      if (options.failComment === true) {
        return jsonResponse({ data: null, errors: [{ message: "Comment write failed" }] })
      }
      return jsonResponse({
        data: {
          commentCreate: {
            success: true,
            comment: {
              id: "c1",
              body: "Shipped.",
              createdAt: "2026-01-01T10:00:00.000Z",
              user,
            },
          },
        },
      })
    }
    return jsonResponse({ errors: [{ message: `Unexpected query: ${request.query}` }] }, 400)
  })
  return { recorder, state }
}

afterEach(() => {
  process.exitCode = 0
})

describe("issue update --comment", () => {
  test("returns the issue and the comment", async () => {
    const { recorder, state } = updateHandler()
    const lines: string[] = []
    await runIssue(
      recorder.handler,
      ["update", "RAT-1", "--state", "Done", "--comment", "Shipped.", "--json"],
      lines,
    )
    const update = recorder.requests.findIndex((request) =>
      request.query.includes("mutation UpdateIssue"),
    )
    const comment = recorder.requests.findIndex((request) =>
      request.query.includes("mutation CreateComment"),
    )
    expect(update).toBeGreaterThanOrEqual(0)
    expect(comment).toBeGreaterThan(update)
    expect(state.updates).toBe(1)
    expect(state.comments).toBe(1)
    expect(lastJson(lines)).toMatchObject({
      issue: { identifier: "RAT-1" },
      comment: { id: "c1", body: "Shipped." },
    })
  })

  test("a comment on its own skips the issue update", async () => {
    const { recorder, state } = updateHandler()
    const lines: string[] = []
    await runIssue(recorder.handler, ["update", "RAT-1", "--comment", "Only.", "--json"], lines)
    expect(state.updates).toBe(0)
    expect(state.comments).toBe(1)
    expect(lastJson(lines)).toMatchObject({ issue: { identifier: "RAT-1" }, comment: { id: "c1" } })
  })

  test("a validation failure aborts with zero writes", async () => {
    const { recorder, state } = updateHandler()
    const lines: string[] = []
    await runIssue(
      recorder.handler,
      ["update", "RAT-1", "--state", "No Such", "--comment", "Shipped.", "--json"],
      lines,
    )
    expect(decodeError(lastJson(lines)).code).toBe("not_found")
    expect(state.updates).toBe(0)
    expect(state.comments).toBe(0)
    expect(requestOf(recorder, "mutation UpdateIssue")).toBeUndefined()
    expect(requestOf(recorder, "mutation CreateComment")).toBeUndefined()
    expect(process.exitCode).toBe(1)
  })

  test("an empty comment aborts before any write", async () => {
    const { recorder, state } = updateHandler()
    const lines: string[] = []
    await runIssue(
      recorder.handler,
      ["update", "RAT-1", "--state", "Done", "--comment", "  ", "--json"],
      lines,
    )
    expect(decodeError(lastJson(lines)).code).toBe("validation")
    expect(state.updates).toBe(0)
    expect(state.comments).toBe(0)
    expect(process.exitCode).toBe(1)
  })

  test("a comment failure keeps the issue update and exits 1", async () => {
    const { recorder, state } = updateHandler({ failComment: true })
    const lines: string[] = []
    await runIssue(
      recorder.handler,
      ["update", "RAT-1", "--state", "Done", "--comment", "Shipped.", "--json"],
      lines,
    )
    expect(state.updates).toBe(1)
    expect(state.comments).toBe(1)
    expect(lastJson(lines)).toMatchObject({
      issue: { identifier: "RAT-1" },
      comment: null,
      error: { message: "Comment write failed" },
    })
    expect(process.exitCode).toBe(1)
  })

  test("a dry run prints both actions and writes nothing", async () => {
    const { recorder, state } = updateHandler()
    const lines: string[] = []
    await runIssue(
      recorder.handler,
      ["update", "RAT-1", "--state", "Done", "--comment", "Shipped.", "--dry-run", "--json"],
      lines,
    )
    expect(lastJson(lines)).toMatchObject({
      dryRun: true,
      actions: [
        { action: "update", target: "RAT-1" },
        { action: "comment-create", target: "RAT-1", changes: { body: "Shipped." } },
      ],
    })
    expect(state.updates).toBe(0)
    expect(state.comments).toBe(0)
    expect(requestOf(recorder, "mutation UpdateIssue")).toBeUndefined()
    expect(requestOf(recorder, "mutation CreateComment")).toBeUndefined()
  })

  test("human output prints the update line and the comment line", async () => {
    const { recorder } = updateHandler()
    const lines: string[] = []
    await runIssue(
      recorder.handler,
      ["update", "RAT-1", "--state", "Done", "--comment", "Shipped."],
      lines,
    )
    expect(lines).toContain("Updated RAT-1.")
    expect(lines).toContain("Commented on RAT-1.")
  })
})
