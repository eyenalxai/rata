import { Result, Schema } from "effect"

import type { ParsedSection, SectionLookupError } from "@/domain/body/section/model"

import {
  ambiguousError,
  availableHeadings,
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

const sectionBatchReasons = ["missing", "duplicate", "empty"] as const
type SectionBatchReason = (typeof sectionBatchReasons)[number]

class SectionBatchError extends Schema.TaggedError<SectionBatchError>()("SectionBatchError", {
  reason: Schema.Literals(sectionBatchReasons),
  heading: Schema.String,
  available: Schema.Array(Schema.String),
  message: Schema.String,
}) {}

type SectionReplacement = {
  readonly heading: string
  readonly content: string
}

type SectionReplacementAction = {
  readonly heading: string
  readonly action: "replaced" | "skipped"
}

type SectionReplacementResult = {
  readonly body: string
  readonly sections: readonly SectionReplacementAction[]
}

const batchError = (
  reason: SectionBatchReason,
  heading: string,
  sections: readonly ParsedSection[],
): SectionBatchError => {
  const message =
    reason === "missing"
      ? `No section named "${heading}".`
      : reason === "duplicate"
        ? `Heading "${heading}" appears more than once.`
        : "The section heading is empty."
  return new SectionBatchError({
    reason,
    heading,
    available: availableHeadings(sections),
    message,
  })
}

const resolveReplacements = (
  sections: readonly ParsedSection[],
  replacements: readonly SectionReplacement[],
): Result.Result<
  readonly { readonly replacement: SectionReplacement; readonly section: ParsedSection }[],
  SectionBatchError
> => {
  const seen = new Set<string>()
  const targets: { readonly replacement: SectionReplacement; readonly section: ParsedSection }[] =
    []
  for (const replacement of replacements) {
    const { heading } = replacement
    if (heading.trim().length === 0) {
      return Result.fail(batchError("empty", heading, sections))
    }
    if (seen.has(heading)) {
      return Result.fail(batchError("duplicate", heading, sections))
    }
    seen.add(heading)
    const matches = findMatches(sections, heading)
    const section = matches[0]
    if (matches.length === 0 || section === undefined) {
      return Result.fail(batchError("missing", heading, sections))
    }
    if (matches.length > 1) {
      return Result.fail(batchError("duplicate", heading, sections))
    }
    targets.push({ replacement, section })
  }
  const ordered = targets.toSorted((left, right) => left.section.start - right.section.start)
  for (const [index, target] of ordered.entries()) {
    const previous = ordered[index - 1]
    if (previous !== undefined && target.section.start < previous.section.end) {
      return Result.fail(batchError("duplicate", target.replacement.heading, sections))
    }
  }
  return Result.succeed(targets)
}

const replaceSections = (
  body: string,
  replacements: readonly SectionReplacement[],
): Result.Result<SectionReplacementResult, SectionBatchError> => {
  const normalized = normalizeLineEndings(body)
  const parsed = parseBody(normalized)
  const resolved = resolveReplacements(parsed.sections, replacements)
  if (Result.isFailure(resolved)) {
    return Result.fail(resolved.failure)
  }
  const actions = new Map<string, "replaced" | "skipped">()
  let next = normalized
  const ordered = resolved.success.toSorted(
    (left, right) => right.section.start - left.section.start,
  )
  for (const target of ordered) {
    const lines = next.split("\n")
    const content = contentLinesOf(target.replacement.content)
    const candidate = replaceExisting(lines, target.section, content)
    if (candidate === next) {
      actions.set(target.replacement.heading, "skipped")
      continue
    }
    next = candidate
    actions.set(target.replacement.heading, "replaced")
  }
  return Result.succeed({
    body: next === normalized ? body : next,
    sections: replacements.map((replacement) => ({
      heading: replacement.heading,
      action: actions.get(replacement.heading) ?? "skipped",
    })),
  })
}

export {
  appendSection,
  replaceSection,
  replaceSections,
  SectionBatchError,
  type SectionReplacement,
  type SectionReplacementAction,
  type SectionReplacementResult,
}
