import { lastJson, runIssue, runRoot } from "@test/cli-harness"
import { jsonResponse } from "@test/issue-fixtures"
import { issueCreated, makeRecorder, teamDetailResponse } from "@test/issue-write/fixtures"
import { describe, expect, test } from "bun:test"

const handler = () => {
  const recorder = makeRecorder((request) => {
    const detail = teamDetailResponse(request)
    if (detail !== undefined) {
      return detail
    }
    if (request.query.includes("mutation CreateIssue")) {
      return issueCreated()
    }
    return jsonResponse({ errors: [{ message: `Unexpected query: ${request.query}` }] }, 400)
  })
  return recorder
}

const create = (args: readonly string[], lines: string[]) =>
  runIssue(handler().handler, ["create", ...args], lines)

describe("issue create", () => {
  test("returns the issue and the write result", async () => {
    const recorder = handler()
    const lines: string[] = []
    const exit = await runIssue(
      recorder.handler,
      ["create", "--title", "Fix login", "--team", "RAT", "--format", "json"],
      lines,
    )

    expect(lastJson(lines)).toMatchObject({
      issue: { identifier: "RAT-1", title: "Title RAT-1" },
      result: {
        action: "create",
        status: "updated",
        changed: ["issue"],
        dryRun: false,
        snapshot: null,
        actions: [
          {
            action: "create",
            target: "new",
            status: "updated",
          },
        ],
      },
    })
    expect(
      recorder.requests.filter((request) => request.query.includes("mutation CreateIssue")),
    ).toHaveLength(1)
    expect(exit.code).toBe(0)
  })

  test("a dry run returns the plan and writes nothing", async () => {
    const recorder = handler()
    const lines: string[] = []
    await runIssue(
      recorder.handler,
      ["create", "--title", "Fix login", "--team", "RAT", "--dry-run", "--format", "json"],
      lines,
    )

    expect(lastJson(lines)).toMatchObject({
      issue: null,
      result: {
        action: "create",
        status: "updated",
        dryRun: true,
        changed: ["issue"],
        actions: [{ action: "create", target: "new", status: "updated" }],
      },
    })
    expect(
      recorder.requests.some((request) => request.query.includes("mutation CreateIssue")),
    ).toBe(false)
  })

  test("selects fields from the issue and the result", async () => {
    const lines: string[] = []
    await create(
      [
        "--title",
        "Fix login",
        "--team",
        "RAT",
        "--format",
        "json",
        "--select",
        "issue.identifier,result.status",
      ],
      lines,
    )

    expect(lastJson(lines)).toEqual({
      issue: { identifier: "RAT-1" },
      result: { status: "updated" },
    })
  })

  test("rejects --json", async () => {
    const lines: string[] = []
    const exit = await runRoot(
      handler().handler,
      ["issue", "create", "--title", "Fix login", "--team", "RAT", "--json"],
      lines,
    )

    expect(exit.code).toBe(2)
    expect(lastJson(lines)).toMatchObject({
      error: {
        code: "usage",
        message: "The --json and --fields flags are not supported by issue writes.",
      },
    })
  })

  test("rejects --fields", async () => {
    const lines: string[] = []
    const exit = await runRoot(
      handler().handler,
      ["issue", "create", "--title", "Fix login", "--team", "RAT", "--fields", "identifier"],
      lines,
    )

    expect(exit.code).toBe(2)
    expect(lastJson(lines)).toMatchObject({
      error: {
        code: "usage",
        message: "The --json and --fields flags are not supported by issue writes.",
      },
    })
  })
})
