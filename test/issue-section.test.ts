import { lastJson, runIssue } from "@test/cli-harness"
import { body } from "@test/issue-body/fixtures"
import { requestOf } from "@test/issue-write/fixtures"
import { afterEach, describe, expect, test } from "bun:test"
import { Option, Schema } from "effect"

const SectionDocument = Schema.Struct({
  section: Schema.Struct({
    heading: Schema.String,
    level: Schema.Finite,
    content: Schema.String,
  }),
})

const ErrorEnvelope = Schema.Struct({
  error: Schema.Struct({
    code: Schema.String,
    message: Schema.String,
    hint: Schema.NullOr(Schema.String),
  }),
})

const WrittenSection = Schema.Struct({
  section: Schema.Struct({ heading: Schema.String, level: Schema.Finite }),
})

const SectionDryRun = Schema.Struct({ diff: Schema.String })

const decodeSection = (value: unknown) =>
  Option.getOrThrow(Schema.decodeUnknownOption(SectionDocument)(value))

const decodeError = (value: unknown) =>
  Option.getOrThrow(Schema.decodeUnknownOption(ErrorEnvelope)(value))

const decodeWrittenSection = (value: unknown) =>
  Option.getOrThrow(Schema.decodeUnknownOption(WrittenSection)(value))

const decodeDryRun = (value: unknown) =>
  Option.getOrThrow(Schema.decodeUnknownOption(SectionDryRun)(value))

afterEach(() => {
  process.exitCode = 0
})

describe("issue section get", () => {
  test("prints the section content as JSON", async () => {
    const { recorder } = body("# Title\n\n## Handoff log\n\nLine one.\n\n## Next\n\nBody\n")
    const lines: string[] = []

    await runIssue(recorder.handler, ["section", "get", "RAT-1", "Handoff log", "--json"], lines)

    expect(decodeSection(lastJson(lines)).section).toEqual({
      heading: "Handoff log",
      level: 2,
      content: "Line one.",
    })
    expect(Object.keys(decodeSection(lastJson(lines)).section).toSorted()).toEqual([
      "content",
      "heading",
      "level",
    ])
  })

  test("applies --fields to the section object", async () => {
    const { recorder } = body("## Handoff log\n\nLine one.\n")
    const lines: string[] = []

    await runIssue(
      recorder.handler,
      ["section", "get", "RAT-1", "Handoff log", "--json", "--fields", "content"],
      lines,
    )

    expect(lastJson(lines)).toEqual({ section: { content: "Line one." } })
  })

  test("prints the heading line with --with-heading", async () => {
    const { recorder } = body("## Handoff log\n\nLine one.\n")
    const lines: string[] = []

    await runIssue(
      recorder.handler,
      ["section", "get", "RAT-1", "Handoff log", "--with-heading"],
      lines,
    )

    expect(lines.at(-1)).toBe("## Handoff log\nLine one.")
  })

  test("fails with not_found and lists the available headings", async () => {
    const { recorder } = body("## Handoff log\n\nLine one.\n\n## Next\n\nBody\n")
    const lines: string[] = []

    await runIssue(recorder.handler, ["section", "get", "RAT-1", "Missing", "--json"], lines)

    const error = decodeError(lastJson(lines)).error
    expect(error.code).toBe("not_found")
    expect(error.hint).toBe('Available headings: "Handoff log", "Next".')
  })

  test("fails with ambiguous and names the line numbers", async () => {
    const { recorder } = body("## Handoff log\n\nOne.\n\n## Handoff log\n\nTwo.\n")
    const lines: string[] = []

    await runIssue(recorder.handler, ["section", "get", "RAT-1", "Handoff log", "--json"], lines)

    const error = decodeError(lastJson(lines)).error
    expect(error.code).toBe("ambiguous")
    expect(error.message).toBe('Heading "Handoff log" appears on lines 1, 5.')
  })
})

describe("issue section append", () => {
  test("creates a missing section at the end", async () => {
    const { recorder, state } = body("# Title\n\nIntro.\n")
    const lines: string[] = []

    await runIssue(
      recorder.handler,
      ["section", "append", "RAT-1", "Handoff log", "--body", "Started.", "--json"],
      lines,
    )

    expect(lastJson(lines)).toEqual({
      issue: { identifier: "RAT-1", updatedAt: "2026-01-02T09:00:00.000Z" },
      section: { heading: "Handoff log", level: 2 },
    })
    expect(state.description).toBe("# Title\n\nIntro.\n\n## Handoff log\n\nStarted.\n")
  })

  test("uses --level for a new section", async () => {
    const { recorder, state } = body("# Title\n")
    const lines: string[] = []

    await runIssue(
      recorder.handler,
      ["section", "append", "RAT-1", "Notes", "--body", "Line.", "--level", "3", "--json"],
      lines,
    )

    expect(state.description).toBe("# Title\n\n### Notes\n\nLine.\n")
    expect(decodeWrittenSection(lastJson(lines)).section.level).toBe(3)
  })

  test("appends after the existing content", async () => {
    const { recorder, state } = body("## Handoff log\n\nLine one.\n\n## Next\n\nBody\n")
    const lines: string[] = []

    await runIssue(
      recorder.handler,
      ["section", "append", "RAT-1", "Handoff log", "--body", "Line two.", "--json"],
      lines,
    )

    expect(state.description).toBe("## Handoff log\n\nLine one.\n\nLine two.\n\n## Next\n\nBody\n")
  })

  test("rejects an empty body", async () => {
    const { recorder } = body("## Handoff log\n\nLine one.\n")
    const lines: string[] = []

    await runIssue(
      recorder.handler,
      ["section", "append", "RAT-1", "Handoff log", "--body", "  "],
      lines,
    )

    expect(lines).toContain("error: The section body is empty.")
    expect(recorder.requests).toHaveLength(0)
  })

  test("previews the diff without writing", async () => {
    const { recorder, state } = body("## Handoff log\n\nLine one.\n")
    const lines: string[] = []

    await runIssue(
      recorder.handler,
      ["section", "append", "RAT-1", "Handoff log", "--body", "Line two.", "--dry-run", "--json"],
      lines,
    )

    expect(lastJson(lines)).toMatchObject({
      dryRun: true,
      action: "section-append",
      target: "RAT-1",
      heading: "Handoff log",
    })
    expect(decodeDryRun(lastJson(lines)).diff).toContain("+Line two.")
    expect(state.description).toBe("## Handoff log\n\nLine one.\n")
    expect(requestOf(recorder, "mutation UpdateIssue")).toBeUndefined()
  })

  test("writes when updatedAt still matches", async () => {
    const { recorder, state } = body("## Handoff log\n\nLine one.\n")
    const lines: string[] = []

    await runIssue(
      recorder.handler,
      [
        "section",
        "append",
        "RAT-1",
        "Handoff log",
        "--body",
        "Line two.",
        "--if-unchanged",
        "2026-01-01T09:00:00.000Z",
        "--json",
      ],
      lines,
    )

    expect(state.description).toContain("Line two.")
    expect(lastJson(lines)).toMatchObject({
      section: { heading: "Handoff log", level: 2 },
    })
  })

  test("fails with conflict when updatedAt differs", async () => {
    const { recorder, state } = body("## Handoff log\n\nLine one.\n")
    const lines: string[] = []

    await runIssue(
      recorder.handler,
      [
        "section",
        "append",
        "RAT-1",
        "Handoff log",
        "--body",
        "Line two.",
        "--if-unchanged",
        "2025-01-01T09:00:00.000Z",
        "--json",
      ],
      lines,
    )

    const error = decodeError(lastJson(lines)).error
    expect(error.code).toBe("conflict")
    expect(process.exitCode).toBe(4)
    expect(error.hint).toBe(
      "The current updatedAt is 2026-01-01T09:00:00.000Z. Re-read the issue and retry.",
    )
    expect(state.description).toBe("## Handoff log\n\nLine one.\n")
    expect(requestOf(recorder, "mutation UpdateIssue")).toBeUndefined()
  })
})

describe("issue section replace", () => {
  test("keeps the heading and replaces the content", async () => {
    const { recorder, state } = body("## Handoff log\n\nOld.\n\n## Next\n\nBody\n")
    const lines: string[] = []

    await runIssue(
      recorder.handler,
      ["section", "replace", "RAT-1", "Handoff log", "--body", "New.", "--json"],
      lines,
    )

    expect(state.description).toBe("## Handoff log\n\nNew.\n\n## Next\n\nBody\n")
    expect(lastJson(lines)).toMatchObject({
      section: { heading: "Handoff log", level: 2 },
    })
  })

  test("fails when the section is missing", async () => {
    const { recorder } = body("## Handoff log\n\nOld.\n")
    const lines: string[] = []

    await runIssue(
      recorder.handler,
      ["section", "replace", "RAT-1", "Missing", "--body", "New.", "--json"],
      lines,
    )

    expect(decodeError(lastJson(lines)).error.code).toBe("not_found")
    expect(requestOf(recorder, "mutation UpdateIssue")).toBeUndefined()
  })
})
