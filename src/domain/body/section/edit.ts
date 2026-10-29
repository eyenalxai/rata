import { Result } from "effect"

import type { ParsedSection, SectionLookupError } from "@/domain/body/section/model"

import {
  ambiguousError,
  findMatches,
  isBlank,
  parseBody,
  resolveSection,
  trimLineEnd,
} from "@/domain/body/section/model"
import { normalizeLineEndings } from "@/domain/body/text"

const contentLinesOf = (content: string): readonly string[] => {
  const normalized = normalizeLineEndings(content)
  if (normalized.length === 0) {
    return []
  }
  return normalized.replace(/\n+$/u, "").split("\n")
}

const insertNewSection = (
  normalized: string,
  lines: readonly string[],
  heading: string,
  content: readonly string[],
  level: number,
): string => {
  const hasContent = normalized.trim().length > 0
  const base = hasContent ? [...lines] : []
  if (hasContent && normalized.endsWith("\n")) {
    base.pop()
  }
  const headingLine = `${"#".repeat(level)} ${heading}`
  if (base.length === 0) {
    base.push(headingLine)
  } else if (isBlank(base.at(-1) ?? "")) {
    base.push(headingLine)
  } else {
    base.push("", headingLine)
  }
  if (content.length > 0) {
    base.push("", ...content)
  }
  if (normalized.endsWith("\n")) {
    base.push("")
  }
  return base.join("\n")
}

const blankEdges = (
  region: readonly string[],
): { readonly leading: number; readonly trailing: number; readonly core: readonly string[] } => {
  let leading = 0
  while (leading < region.length && isBlank(region[leading] ?? "")) {
    leading += 1
  }
  let trailing = 0
  while (
    trailing < region.length - leading &&
    isBlank(region[region.length - 1 - trailing] ?? "")
  ) {
    trailing += 1
  }
  return { leading, trailing, core: region.slice(leading, region.length - trailing) }
}

const appendToExisting = (
  lines: readonly string[],
  section: ParsedSection,
  content: readonly string[],
): string => {
  const region = lines.slice(section.start + 1, section.end)
  const edges = blankEdges(region)
  const leadingBlanks =
    edges.core.length === 0 ? [""] : edges.leading > 0 ? region.slice(0, edges.leading) : []
  const separator = edges.core.length > 0 ? [""] : []
  const trailingBlanks =
    edges.trailing > 0
      ? region.slice(region.length - edges.trailing)
      : section.end < lines.length
        ? [""]
        : []
  const headingLine = trimLineEnd(lines[section.start] ?? "")
  return [
    ...lines.slice(0, section.start),
    headingLine,
    ...leadingBlanks,
    ...edges.core,
    ...separator,
    ...content,
    ...trailingBlanks,
    ...lines.slice(section.end),
  ].join("\n")
}

const appendSection = (
  body: string,
  heading: string,
  content: string,
  level = 2,
): Result.Result<string, SectionLookupError> => {
  const normalized = normalizeLineEndings(body)
  const parsed = parseBody(normalized)
  const matches = findMatches(parsed.sections, heading)
  if (matches.length > 1) {
    return Result.fail(ambiguousError(heading, matches))
  }
  const linesToAppend = contentLinesOf(content)
  const match = matches[0]
  if (match === undefined) {
    return Result.succeed(insertNewSection(normalized, parsed.lines, heading, linesToAppend, level))
  }
  return Result.succeed(appendToExisting(parsed.lines, match, linesToAppend))
}

const replaceExisting = (
  lines: readonly string[],
  section: ParsedSection,
  content: readonly string[],
): string => {
  const region = lines.slice(section.start + 1, section.end)
  const edges = blankEdges(region)
  const leadingBlanks = edges.leading > 0 ? region.slice(0, edges.leading) : [""]
  const trailingBlanks =
    edges.trailing > 0
      ? region.slice(region.length - edges.trailing)
      : section.end < lines.length
        ? [""]
        : []
  const headingLine = trimLineEnd(lines[section.start] ?? "")
  return [
    ...lines.slice(0, section.start),
    headingLine,
    ...leadingBlanks,
    ...content,
    ...trailingBlanks,
    ...lines.slice(section.end),
  ].join("\n")
}

const replaceSection = (
  body: string,
  heading: string,
  content: string,
): Result.Result<string, SectionLookupError> => {
  const normalized = normalizeLineEndings(body)
  const parsed = parseBody(normalized)
  const section = resolveSection(parsed.sections, heading)
  if (Result.isFailure(section)) {
    return Result.fail(section.failure)
  }
  return Result.succeed(replaceExisting(parsed.lines, section.success, contentLinesOf(content)))
}

export { appendSection, replaceSection }
