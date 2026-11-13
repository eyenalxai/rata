import { lastJson, runIssue } from "@test/cli-harness"
import { body } from "@test/issue-body/fixtures"
import {
  decodeDryRun,
  decodeError,
  decodeWrite,
  document,
  sections,
  sectionsInput,
  stdin,
} from "@test/issue-update/sections/fixtures"
import { requestOf } from "@test/issue-write/fixtures"
import { afterEach, describe, expect, test } from "bun:test"

afterEach(() => {
  process.exitCode = 0
})

describe("issue update --sections-file", () => {
  test("replaces four sections in one snapshot and one description write", async () => {
    const { recorder, state } = body(document)
    const lines: string[] = []

    await runIssue(
      recorder.handler,
      ["update", "RAT-1", "--sections-file", "-", "--json"],
      lines,
      undefined,
      stdin(sectionsInput(sections)),
    )

    const result = decodeWrite(lastJson(lines))
    expect(result).toMatchObject({
      status: "updated",
      updatedAt: "2026-01-02T09:00:00.000Z",
      issue: { identifier: "RAT-1", updatedAt: "2026-01-02T09:00:00.000Z" },
    })
    expect(result.sections).toEqual([
      { heading: "Flow", action: "replaced" },
      { heading: "Gates", action: "replaced" },
      { heading: "Outputs", action: "replaced" },
      { heading: "Next step", action: "replaced" },
    ])
    expect(state.description).toBe(
      "# Mission\n\n## Flow\n\nNew flow.\n\n## Gates\n\nNew gate.\n\n## Outputs\n\nNew output.\n\n## Next step\n\nNew next.\n",
    )
    expect(
      recorder.requests.filter((request) => request.query.includes("query IssueBody")),
    ).toHaveLength(1)
    expect(
      recorder.requests.filter((request) => request.query.includes("mutation UpdateIssue")),
    ).toHaveLength(1)
  })

  test("previews one diff with the snapshot and writes nothing", async () => {
    const { recorder, state } = body(document)
    const lines: string[] = []

    await runIssue(
      recorder.handler,
      ["update", "RAT-1", "--sections-file", "-", "--dry-run", "--json"],
      lines,
      undefined,
      stdin(sectionsInput(sections)),
    )

    const result = decodeDryRun(lastJson(lines))
    expect(result).toMatchObject({
      dryRun: true,
      status: "updated",
      updatedAt: "2026-01-01T09:00:00.000Z",
    })
    expect(result.diff).toContain("+New flow.")
    expect(result.diff).toContain("+New gate.")
    expect(result.diff).toContain("+New output.")
    expect(result.diff).toContain("+New next.")
    expect(state.description).toBe(document)
    expect(requestOf(recorder, "mutation UpdateIssue")).toBeUndefined()
  })

  test("writes with the updatedAt from the dry run", async () => {
    const { recorder, state } = body(document)
    const previewLines: string[] = []

    await runIssue(
      recorder.handler,
      ["update", "RAT-1", "--sections-file", "-", "--dry-run", "--json"],
      previewLines,
      undefined,
      stdin(sectionsInput(sections)),
    )
    const preview = decodeDryRun(lastJson(previewLines))
    const lines: string[] = []

    await runIssue(
      recorder.handler,
      ["update", "RAT-1", "--sections-file", "-", "--if-unchanged", preview.updatedAt, "--json"],
      lines,
      undefined,
      stdin(sectionsInput(sections)),
    )

    expect(decodeWrite(lastJson(lines)).status).toBe("updated")
    expect(state.description).toContain("New flow.")
    expect(state.description).toContain("New next.")
  })

  test("fails with conflict when the issue changed since the snapshot", async () => {
    const { recorder, state } = body(document)
    const lines: string[] = []

    await runIssue(
      recorder.handler,
      [
        "update",
        "RAT-1",
        "--sections-file",
        "-",
        "--if-unchanged",
        "2025-01-01T09:00:00.000Z",
        "--json",
      ],
      lines,
      undefined,
      stdin(sectionsInput(sections)),
    )

    const error = decodeError(lastJson(lines))
    expect(error.code).toBe("conflict")
    expect(error.hint).toBe(
      "The current updatedAt is 2026-01-01T09:00:00.000Z. Re-read the issue and retry.",
    )
    expect(state.description).toBe(document)
    expect(requestOf(recorder, "mutation UpdateIssue")).toBeUndefined()
  })

  test("a repeated idempotent write reports skipped", async () => {
    const { recorder, state } = body(document)
    const first: string[] = []
    const input = sectionsInput([{ heading: "Flow", content: "New flow." }])

    await runIssue(
      recorder.handler,
      ["update", "RAT-1", "--sections-file", "-", "--json"],
      first,
      undefined,
      stdin(input),
    )
    const firstResult = decodeWrite(lastJson(first))
    const requestsAfterFirst = recorder.requests.length
    const second: string[] = []

    await runIssue(
      recorder.handler,
      [
        "update",
        "RAT-1",
        "--sections-file",
        "-",
        "--if-unchanged",
        firstResult.updatedAt,
        "--json",
      ],
      second,
      undefined,
      stdin(input),
    )

    const result = decodeWrite(lastJson(second))
    expect(result.status).toBe("skipped")
    expect(result.sections).toEqual([{ heading: "Flow", action: "skipped" }])
    expect(
      recorder.requests
        .slice(requestsAfterFirst)
        .some((request) => request.query.includes("mutation UpdateIssue")),
    ).toBe(false)
    expect(state.description).toContain("## Flow\n\nNew flow.")
  })
})
