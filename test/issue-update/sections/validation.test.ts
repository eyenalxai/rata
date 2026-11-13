import { lastJson, runIssue } from "@test/cli-harness"
import { body } from "@test/issue-body/fixtures"
import { decodeError, document, sectionsInput, stdin } from "@test/issue-update/sections/fixtures"
import { requestOf } from "@test/issue-write/fixtures"
import { afterEach, describe, expect, test } from "bun:test"

const available = 'Available headings: "Mission", "Flow", "Gates", "Outputs", "Next step".'

const rejectCombination = async (flags: readonly string[]) => {
  const { recorder } = body(document)
  const lines: string[] = []
  await runIssue(recorder.handler, ["update", "RAT-1", "--sections-file", "-", ...flags], lines)
  expect(lines).toEqual([
    "error: The --sections-file flag cannot be combined with --body, --body-file or --append.",
    "hint: rata issue update <ref> --sections-file -",
  ])
  expect(recorder.requests).toHaveLength(0)
  expect(process.exitCode).toBe(2)
}

afterEach(() => {
  process.exitCode = 0
})

describe("issue update --sections-file validation", () => {
  test("fails with not_found and names the available headings", async () => {
    const { recorder, state } = body(document)
    const lines: string[] = []

    await runIssue(
      recorder.handler,
      ["update", "RAT-1", "--sections-file", "-", "--json"],
      lines,
      undefined,
      stdin(
        sectionsInput([
          { heading: "Flow", content: "New flow." },
          { heading: "Missing", content: "Nothing." },
        ]),
      ),
    )

    const error = decodeError(lastJson(lines))
    expect(error.code).toBe("not_found")
    expect(error.hint).toBe(available)
    expect(state.description).toBe(document)
    expect(requestOf(recorder, "mutation UpdateIssue")).toBeUndefined()
    expect(process.exitCode).toBe(3)
  })

  test("fails with ambiguous when the file repeats a heading", async () => {
    const { recorder, state } = body(document)
    const lines: string[] = []

    await runIssue(
      recorder.handler,
      ["update", "RAT-1", "--sections-file", "-", "--json"],
      lines,
      undefined,
      stdin(
        sectionsInput([
          { heading: "Flow", content: "One." },
          { heading: "Flow", content: "Two." },
        ]),
      ),
    )

    const error = decodeError(lastJson(lines))
    expect(error.code).toBe("ambiguous")
    expect(error.hint).toBe(available)
    expect(state.description).toBe(document)
    expect(requestOf(recorder, "mutation UpdateIssue")).toBeUndefined()
  })

  test("fails with ambiguous when the issue repeats a heading", async () => {
    const { recorder, state } = body("## Flow\n\nOne.\n\n## Flow\n\nTwo.\n")
    const lines: string[] = []

    await runIssue(
      recorder.handler,
      ["update", "RAT-1", "--sections-file", "-", "--json"],
      lines,
      undefined,
      stdin(sectionsInput([{ heading: "Flow", content: "Three." }])),
    )

    const error = decodeError(lastJson(lines))
    expect(error.code).toBe("ambiguous")
    expect(error.hint).toBe('Available headings: "Flow".')
    expect(state.description).toBe("## Flow\n\nOne.\n\n## Flow\n\nTwo.\n")
    expect(requestOf(recorder, "mutation UpdateIssue")).toBeUndefined()
  })

  test("fails with validation on an empty heading", async () => {
    const { recorder } = body(document)
    const lines: string[] = []

    await runIssue(
      recorder.handler,
      ["update", "RAT-1", "--sections-file", "-", "--json"],
      lines,
      undefined,
      stdin(sectionsInput([{ heading: "  ", content: "Nothing." }])),
    )

    const error = decodeError(lastJson(lines))
    expect(error.code).toBe("validation")
    expect(error.message).toBe("The section heading is empty.")
    expect(error.hint).toBe(available)
    expect(requestOf(recorder, "mutation UpdateIssue")).toBeUndefined()
  })

  test("rejects --body before any read", async () => {
    await rejectCombination(["--body", "Whole body."])
  })

  test("rejects --body-file before any read", async () => {
    await rejectCombination(["--body-file", "body.md"])
  })

  test("rejects --append before any read", async () => {
    await rejectCombination(["--append"])
  })

  test("rejects a sections file that is not valid JSON", async () => {
    const { recorder } = body(document)
    const lines: string[] = []

    await runIssue(
      recorder.handler,
      ["update", "RAT-1", "--sections-file", "-", "--json"],
      lines,
      undefined,
      stdin("not json"),
    )

    expect(decodeError(lastJson(lines)).code).toBe("validation")
    expect(recorder.requests).toHaveLength(0)
  })

  test("rejects a sections document with no sections", async () => {
    const { recorder } = body(document)
    const lines: string[] = []

    await runIssue(
      recorder.handler,
      ["update", "RAT-1", "--sections-file", "-", "--json"],
      lines,
      undefined,
      stdin(JSON.stringify({ sections: [] })),
    )

    expect(decodeError(lastJson(lines)).message).toBe(
      "The sections file needs at least one section.",
    )
    expect(recorder.requests).toHaveLength(0)
  })
})

describe("sections write error output", () => {
  test("prints the missing heading as prose without --json", async () => {
    const { recorder } = body(document)
    const lines: string[] = []

    await runIssue(
      recorder.handler,
      ["update", "RAT-1", "--sections-file", "-"],
      lines,
      undefined,
      stdin(sectionsInput([{ heading: "Missing", content: "Nothing." }])),
    )

    expect(lines).toContain('error: No section named "Missing".')
    expect(lines).toContain(`hint: ${available}`)
  })
})
