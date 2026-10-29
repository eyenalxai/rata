import { describe, expect, test } from "bun:test"
import { Result } from "effect"

import { parseSections, readSection } from "@/domain/body/section"
import { appendSection, replaceSection } from "@/domain/body/section/edit"
import { SectionAmbiguousError, SectionNotFoundError } from "@/domain/body/section/model"

const success = (result: Result.Result<string, unknown>): string => {
  if (Result.isFailure(result)) {
    throw result.failure
  }
  return result.success
}

const failure = (result: Result.Result<unknown, unknown>): unknown => {
  if (Result.isSuccess(result)) {
    throw new Error("Expected a failure.")
  }
  return result.failure
}

describe("parseSections", () => {
  test("reads ATX headings and ignores setext and unterminated heading marks", () => {
    const body = [
      "# Title",
      "Setext",
      "======",
      "##NoSpace",
      "####### Too deep",
      "### Closed ###",
      "Body",
    ].join("\n")

    expect(parseSections(body)).toEqual([
      {
        heading: "Title",
        level: 1,
        content: "Setext\n======\n##NoSpace\n####### Too deep\n### Closed ###\nBody",
        line: 1,
      },
      { heading: "Closed", level: 3, content: "Body", line: 6 },
    ])
  })

  test("keeps deeper headings inside a section", () => {
    const body = [
      "## Parent",
      "",
      "Parent body.",
      "",
      "### Child",
      "",
      "Child body.",
      "",
      "## Sibling",
      "",
      "Sibling body.",
    ].join("\n")

    const sections = parseSections(body)

    expect(sections.map((section) => section.heading)).toEqual(["Parent", "Child", "Sibling"])
    expect(sections[0]?.content).toBe("Parent body.\n\n### Child\n\nChild body.")
    expect(sections[2]?.content).toBe("Sibling body.")
  })

  test("ignores headings inside backtick and tilde fences", () => {
    const body = [
      "# Real",
      "",
      "```md",
      "# Not a heading",
      "```",
      "",
      "~~~",
      "## Also not a heading",
      "~~~",
      "",
      "## After",
      "",
      "Body",
    ].join("\n")

    expect(parseSections(body).map((section) => section.heading)).toEqual(["Real", "After"])
  })

  test("normalizes CRLF line endings", () => {
    const body = "## Handoff log\r\n\r\nLine one.\r\n\r\n## Next\r\n\r\nBody\r\n"

    expect(parseSections(body)[0]?.content).toBe("Line one.")
    expect(parseSections(body)[0]?.line).toBe(1)
  })

  test("accepts ATX headings indented by up to three spaces", () => {
    const body = "   ## Handoff log\n\nLine one.\n"

    expect(parseSections(body)).toEqual([
      { heading: "Handoff log", level: 2, content: "Line one.", line: 1 },
    ])
  })
})

describe("readSection", () => {
  test("returns the content without the heading", () => {
    const body = "# Title\n\nIntro\n\n## Handoff log\n\nLine one.\n\nLine two.\n\n## Next\n"
    const section = Result.getOrThrow(readSection(body, "Handoff log"))

    expect(section).toEqual({
      heading: "Handoff log",
      level: 2,
      content: "Line one.\n\nLine two.",
      line: 5,
    })
  })

  test("lists the available headings when the section is missing", () => {
    const error = failure(readSection("## A\n\n## B\n", "C"))

    expect(error).toBeInstanceOf(SectionNotFoundError)
    expect(error).toMatchObject({
      heading: "C",
      available: ["A", "B"],
    })
  })

  test("reports duplicate headings with their line numbers", () => {
    const error = failure(readSection("## A\n\nx\n\n## A\n\ny\n", "A"))

    expect(error).toBeInstanceOf(SectionAmbiguousError)
    expect(error).toMatchObject({ heading: "A", lines: [1, 5] })
  })

  test("matches headings exactly and case-sensitively", () => {
    expect(Result.isFailure(readSection("## Handoff log\n\nx\n", "handoff log"))).toBe(true)
  })
})

describe("appendSection", () => {
  test("creates a missing section at the end with a blank separator", () => {
    const body = "# Title\n\nIntro.\n"

    expect(success(appendSection(body, "Handoff log", "Started.", 2))).toBe(
      "# Title\n\nIntro.\n\n## Handoff log\n\nStarted.\n",
    )
  })

  test("preserves existing trailing blank lines before a new section", () => {
    const body = "# Title\n\nIntro.\n\n\n"

    expect(success(appendSection(body, "Handoff log", "Started.", 2))).toBe(
      "# Title\n\nIntro.\n\n\n## Handoff log\n\nStarted.\n",
    )
  })

  test("uses the requested heading level for a new section", () => {
    expect(success(appendSection("", "Notes", "Line.", 3))).toBe("### Notes\n\nLine.")
  })

  test("appends after the existing content with a blank line", () => {
    const body = "## Handoff log\n\nLine one.\n\n## Next\n\nBody\n"

    expect(success(appendSection(body, "Handoff log", "Line two."))).toBe(
      "## Handoff log\n\nLine one.\n\nLine two.\n\n## Next\n\nBody\n",
    )
  })

  test("appends content after a deeper subsection", () => {
    const body = "## Parent\n\nIntro.\n\n### Child\n\nChild body.\n\n## Sibling\n"

    expect(success(appendSection(body, "Parent", "Tail."))).toBe(
      "## Parent\n\nIntro.\n\n### Child\n\nChild body.\n\nTail.\n\n## Sibling\n",
    )
  })

  test("adds the content directly to an empty section", () => {
    const body = "## Handoff log\n\n## Next\n\nBody\n"

    expect(success(appendSection(body, "Handoff log", "First."))).toBe(
      "## Handoff log\n\nFirst.\n\n## Next\n\nBody\n",
    )
  })

  test("normalizes several blank lines in an empty section", () => {
    const body = "## Handoff log\n\n\n\n## Next\n\nBody\n"

    expect(success(appendSection(body, "Handoff log", "First."))).toBe(
      "## Handoff log\n\nFirst.\n\n## Next\n\nBody\n",
    )
  })

  test("refuses a duplicate heading", () => {
    const error = failure(appendSection("## A\n\nx\n\n## A\n\ny\n", "A", "z"))

    expect(error).toBeInstanceOf(SectionAmbiguousError)
  })
})

describe("replaceSection", () => {
  test("keeps the heading and replaces the content", () => {
    const body = "# Title\n\n## Handoff log\n\nOld.\n\n### Child\n\nChild body.\n\n## Next\n"

    expect(success(replaceSection(body, "Handoff log", "New."))).toBe(
      "# Title\n\n## Handoff log\n\nNew.\n\n## Next\n",
    )
  })

  test("removes the trailing whitespace of the heading line", () => {
    expect(success(replaceSection("## Handoff log  \n\nOld.\n", "Handoff log", "New."))).toBe(
      "## Handoff log\n\nNew.\n",
    )
  })

  test("fails when the section is missing", () => {
    const error = failure(replaceSection("## A\n\nx\n", "Missing", "y"))

    expect(error).toBeInstanceOf(SectionNotFoundError)
  })

  test("keeps the body trailing newline", () => {
    expect(success(replaceSection("## A\n\nOld.\n", "A", "New."))).toBe("## A\n\nNew.\n")
  })
})
