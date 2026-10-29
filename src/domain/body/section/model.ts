import { Result, Schema } from "effect"

import { normalizeLineEndings } from "@/domain/body/text"

class SectionNotFoundError extends Schema.TaggedError<SectionNotFoundError>()(
  "SectionNotFoundError",
  {
    heading: Schema.String,
    available: Schema.Array(Schema.String),
    message: Schema.String,
  },
) {}

class SectionAmbiguousError extends Schema.TaggedError<SectionAmbiguousError>()(
  "SectionAmbiguousError",
  {
    heading: Schema.String,
    lines: Schema.Array(Schema.Finite),
    message: Schema.String,
  },
) {}

type SectionLookupError = SectionNotFoundError | SectionAmbiguousError

type Section = {
  readonly heading: string
  readonly level: number
  readonly content: string
  readonly line: number
}

type ParsedSection = Section & {
  readonly start: number
  readonly end: number
}

type ParsedBody = {
  readonly lines: readonly string[]
  readonly sections: readonly ParsedSection[]
}

type Fence = {
  readonly marker: "`" | "~"
  readonly length: number
}

const isBlank = (line: string): boolean => line.trim().length === 0

const trimLineEnd = (line: string): string => line.replace(/[ \t]+$/u, "")

const fenceOpen = (line: string): Fence | undefined => {
  const marker = /^ {0,3}(?<marker>`{3,}|~{3,})/u.exec(line)?.groups?.marker
  if (marker === undefined) {
    return undefined
  }
  return { marker: marker.startsWith("`") ? "`" : "~", length: marker.length }
}

const fenceClose = (line: string, fence: Fence): boolean => {
  const marker = /^ {0,3}(?<marker>`{3,}|~{3,})[ \t]*$/u.exec(line)?.groups?.marker
  return marker !== undefined && marker.startsWith(fence.marker) && marker.length >= fence.length
}

const headingPattern = /^ {0,3}(?<marks>#{1,6})[ \t]+(?<text>.*)$/u
const closingPattern = /[ \t]+#+[ \t]*$/u

type HeadingMatch = {
  readonly heading: string
  readonly level: number
}

const parseHeading = (line: string): HeadingMatch | undefined => {
  const match = headingPattern.exec(line)
  const marks = match?.groups?.marks
  const text = match?.groups?.text
  if (marks === undefined || text === undefined) {
    return undefined
  }
  return { heading: text.replace(closingPattern, "").trim(), level: marks.length }
}

type Heading = HeadingMatch & {
  readonly index: number
}

const scanHeadings = (lines: readonly string[]): readonly Heading[] => {
  const headings: Heading[] = []
  let fence: Fence | undefined = undefined
  for (const [index, line] of lines.entries()) {
    if (fence !== undefined) {
      if (fenceClose(line, fence)) {
        fence = undefined
      }
      continue
    }
    const open = fenceOpen(line)
    if (open !== undefined) {
      fence = open
      continue
    }
    const parsed = parseHeading(line)
    if (parsed !== undefined) {
      headings.push({ ...parsed, index })
    }
  }
  return headings
}

const contentLines = (lines: readonly string[]): readonly string[] => {
  let start = 0
  let end = lines.length
  while (start < end && isBlank(lines[start] ?? "")) {
    start += 1
  }
  while (end > start && isBlank(lines[end - 1] ?? "")) {
    end -= 1
  }
  return lines.slice(start, end)
}

const parseBody = (body: string): ParsedBody => {
  const lines = normalizeLineEndings(body).split("\n")
  const headings = scanHeadings(lines)
  const sections = headings.map((heading, index): ParsedSection => {
    const next = headings.slice(index + 1).find((candidate) => candidate.level <= heading.level)
    const end = next?.index ?? lines.length
    return {
      heading: heading.heading,
      level: heading.level,
      content: contentLines(lines.slice(heading.index + 1, end)).join("\n"),
      line: heading.index + 1,
      start: heading.index,
      end,
    }
  })
  return { lines, sections }
}

const availableHeadings = (sections: readonly ParsedSection[]): readonly string[] => [
  ...new Set(sections.map((section) => section.heading)),
]

const findMatches = (
  sections: readonly ParsedSection[],
  heading: string,
): readonly ParsedSection[] => sections.filter((section) => section.heading === heading)

const ambiguousError = (
  heading: string,
  matches: readonly ParsedSection[],
): SectionAmbiguousError => {
  const lines = matches.map((section) => section.line)
  return new SectionAmbiguousError({
    heading,
    lines,
    message: `Heading "${heading}" appears on lines ${lines.join(", ")}.`,
  })
}

const resolveSection = (
  sections: readonly ParsedSection[],
  heading: string,
): Result.Result<ParsedSection, SectionLookupError> => {
  const [match, ...rest] = findMatches(sections, heading)
  if (match === undefined) {
    return Result.fail(
      new SectionNotFoundError({
        heading,
        available: availableHeadings(sections),
        message: `No section named "${heading}".`,
      }),
    )
  }
  if (rest.length > 0) {
    return Result.fail(ambiguousError(heading, [match, ...rest]))
  }
  return Result.succeed(match)
}

const publicSection = (section: ParsedSection): Section => ({
  heading: section.heading,
  level: section.level,
  content: section.content,
  line: section.line,
})

export {
  ambiguousError,
  findMatches,
  isBlank,
  type ParsedBody,
  type ParsedSection,
  parseBody,
  publicSection,
  resolveSection,
  SectionAmbiguousError,
  type Section,
  type SectionLookupError,
  SectionNotFoundError,
  trimLineEnd,
}
