import type { FakeLabel, FakeProject, FakeTeam } from "@test/fake-linear/model"

import { lastJsonRecord, runIssue } from "@test/cli-harness"
import { makeFakeLinear } from "@test/fake-linear"
import { jsonResponse, readRequest } from "@test/fake-linear/model"
import { pageInfo } from "@test/issue-fixtures"
import { afterEach, describe, expect, test } from "bun:test"
import { Option, Schema } from "effect"

const userId = "5f0c1f2a-3b4c-4d5e-8f90-1234567890ab"

const team: FakeTeam = {
  id: "team-1",
  key: "RAT",
  name: "Rata",
  timezone: "America/Los_Angeles",
  states: [
    { id: "state-1", name: "Todo", type: "unstarted", position: 0 },
    { id: "state-2", name: "In Progress", type: "started", position: 1 },
    { id: "state-3", name: "Done", type: "completed", position: 2 },
  ],
}

const labels: readonly FakeLabel[] = [
  { id: "label-1", name: "ready-for-agent", color: "#111111", teamId: "team-1" },
  { id: "label-2", name: "bug", color: "#EB5757", teamId: "team-1" },
]

const projects: readonly FakeProject[] = [
  { id: "project-1", name: "Tracker", progress: 0.5, status: { name: "Started" } },
]

const handler = (issues: readonly unknown[]) => {
  const fake = makeFakeLinear({ teams: [team], labels, projects })
  return (request: Parameters<typeof fake.handler>[0]) => {
    const body = readRequest(request)
    if (body.query.includes("query IssueList")) {
      return jsonResponse({ data: { issues: { nodes: issues, pageInfo } } })
    }
    if (body.query.includes("query UserById")) {
      return jsonResponse({
        data: { users: { nodes: body.variables.id === userId ? [{ id: userId }] : [] } },
      })
    }
    return fake.handler(request)
  }
}

const ErrorEnvelope = Schema.Struct({
  error: Schema.Struct({ code: Schema.String, hint: Schema.NullOr(Schema.String) }),
})

const errorOf = (lines: readonly string[]) =>
  Option.getOrThrow(Schema.decodeUnknownOption(ErrorEnvelope)(lastJsonRecord(lines))).error

afterEach(() => {
  process.exitCode = 0
})

describe("issue list filter existence", () => {
  test("fails a read with not_found and the team repair hint when the key is gone", async () => {
    const lines: string[] = []
    await runIssue(handler([]), ["list", "--json"], lines, [{ key: process.cwd(), team: "GONE" }])

    const error = errorOf(lines)
    expect(process.exitCode).toBe(3)
    expect(error.code).toBe("not_found")
    expect(error.hint).toContain("rata team list")
    expect(error.hint).toContain("rata link")
  })

  test("rejects an unknown state with the valid state names", async () => {
    const lines: string[] = []
    await runIssue(handler([]), ["list", "--state", "In Progess", "--json"], lines)

    const error = errorOf(lines)
    expect(process.exitCode).toBe(3)
    expect(error.code).toBe("not_found")
    expect(error.hint).toContain("Todo")
    expect(error.hint).toContain("In Progress")
    expect(error.hint).toContain("Done")
  })

  test("keeps an empty page for a valid state", async () => {
    const lines: string[] = []
    await runIssue(handler([]), ["list", "--state", "In Progress", "--json"], lines)

    expect(process.exitCode).toBe(0)
    expect(lastJsonRecord(lines)).toEqual({ issues: [], pageInfo })
  })

  test("rejects an unknown label with the valid label names", async () => {
    const lines: string[] = []
    await runIssue(handler([]), ["list", "--label", "redy-for-agent", "--json"], lines)

    const error = errorOf(lines)
    expect(process.exitCode).toBe(3)
    expect(error.code).toBe("not_found")
    expect(error.hint).toContain("ready-for-agent")
    expect(error.hint).toContain("bug")
  })

  test("keeps an empty page for a valid label", async () => {
    const lines: string[] = []
    await runIssue(handler([]), ["list", "--label", "ready-for-agent", "--json"], lines)

    expect(process.exitCode).toBe(0)
    expect(lastJsonRecord(lines)).toEqual({ issues: [], pageInfo })
  })

  test("rejects an unknown project with the valid project names", async () => {
    const lines: string[] = []
    await runIssue(handler([]), ["list", "--project", "No Such", "--json"], lines)

    const error = errorOf(lines)
    expect(process.exitCode).toBe(3)
    expect(error.code).toBe("not_found")
    expect(error.hint).toContain("Tracker")
  })

  test("keeps an empty page for a valid project", async () => {
    const lines: string[] = []
    await runIssue(handler([]), ["list", "--project", "Tracker", "--json"], lines)

    expect(process.exitCode).toBe(0)
    expect(lastJsonRecord(lines)).toEqual({ issues: [], pageInfo })
  })

  test("rejects a malformed assignee as validation", async () => {
    const lines: string[] = []
    await runIssue(handler([]), ["list", "--assignee", "not-a-user", "--json"], lines)

    const error = errorOf(lines)
    expect(process.exitCode).toBe(2)
    expect(error.code).toBe("validation")
    expect(error.hint).toContain("me")
  })

  test("rejects an assignee UUID that does not resolve", async () => {
    const lines: string[] = []
    await runIssue(
      handler([]),
      ["list", "--assignee", "00000000-0000-4000-8000-000000000000", "--json"],
      lines,
    )

    const error = errorOf(lines)
    expect(process.exitCode).toBe(3)
    expect(error.code).toBe("not_found")
  })

  test("accepts an assignee UUID that resolves", async () => {
    const lines: string[] = []
    await runIssue(handler([]), ["list", "--assignee", userId, "--json"], lines)

    expect(process.exitCode).toBe(0)
    expect(lastJsonRecord(lines)).toEqual({ issues: [], pageInfo })
  })
})
