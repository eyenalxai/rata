import { Result, Schema } from "effect"

import type { ParsedSection } from "@/domain/body/section/model"
import type { SectionEdit, SectionEditAction, SectionEditMode } from "@/domain/section"

import {
  appendToExisting,
  contentLinesOf,
  insertNewSection,
  replaceExisting,
} from "@/domain/body/section/edit"
import { availableHeadings, findMatches, parseBody } from "@/domain/body/section/model"
import { normalizeLineEndings } from "@/domain/body/text"

const sectionBatchReasons = ["missing", "duplicate", "overlap", "empty"] as const
type SectionBatchReason = (typeof sectionBatchReasons)[number]

class SectionBatchError extends Schema.TaggedError<SectionBatchError>()("SectionBatchError", {
  reason: Schema.Literals(sectionBatchReasons),
  heading: Schema.String,
  available: Schema.Array(Schema.String),
  message: Schema.String,
}) {}

type SectionEditResult = {
  readonly body: string
  readonly sections: readonly SectionEditAction[]
}

type SectionEditOutcome = SectionEditAction["action"]

const batchError = (
  reason: SectionBatchReason,
  heading: string,
  sections: readonly ParsedSection[],
  message?: string,
): SectionBatchError => {
  const fallback =
    reason === "missing"
      ? `No section named "${heading}".`
      : reason === "duplicate"
        ? `Heading "${heading}" appears more than once.`
        : reason === "overlap"
          ? `The edit to "${heading}" overlaps another section edit.`
          : "The section heading is empty."
  return new SectionBatchError({
    reason,
    heading,
    available: availableHeadings(sections),
    message: message ?? fallback,
  })
}

type ResolvedEdit = {
  readonly heading: string
  readonly mode: SectionEditMode
  readonly content: string
  readonly section: ParsedSection | undefined
}

const resolveEdits = (
  sections: readonly ParsedSection[],
  edits: readonly SectionEdit[],
): Result.Result<readonly ResolvedEdit[], SectionBatchError> => {
  const seen = new Set<string>()
  const resolved: ResolvedEdit[] = []
  for (const edit of edits) {
    const heading = edit.heading.trim()
    if (heading.length === 0) {
      return Result.fail(batchError("empty", heading, sections))
    }
    if (seen.has(heading)) {
      return Result.fail(
        batchError(
          "duplicate",
          heading,
          sections,
          `The document edits the section "${heading}" more than once.`,
        ),
      )
    }
    seen.add(heading)
    const matches = findMatches(sections, heading)
    if (matches.length > 1) {
      return Result.fail(batchError("duplicate", heading, sections))
    }
    const section = matches[0]
    if (section === undefined && edit.mode === "replace") {
      return Result.fail(batchError("missing", heading, sections))
    }
    resolved.push({ heading, mode: edit.mode, content: edit.content, section })
  }
  const ordered = resolved
    .filter(
      (edit): edit is ResolvedEdit & { readonly section: ParsedSection } =>
        edit.section !== undefined,
    )
    .toSorted((left, right) => left.section.start - right.section.start)
  for (const [index, edit] of ordered.entries()) {
    const previous = ordered[index - 1]
    if (previous !== undefined && edit.section.start < previous.section.end) {
      return Result.fail(
        batchError(
          "overlap",
          edit.heading,
          sections,
          `The edits to "${previous.heading}" and "${edit.heading}" overlap.`,
        ),
      )
    }
  }
  return Result.succeed(resolved)
}

const editExisting = (
  lines: readonly string[],
  edit: ResolvedEdit & { readonly section: ParsedSection },
): string => {
  const content = contentLinesOf(edit.content)
  return edit.mode === "replace"
    ? replaceExisting(lines, edit.section, content)
    : appendToExisting(lines, edit.section, content)
}

const editSections = (
  body: string,
  edits: readonly SectionEdit[],
): Result.Result<SectionEditResult, SectionBatchError> => {
  const normalized = normalizeLineEndings(body)
  const parsed = parseBody(normalized)
  const resolved = resolveEdits(parsed.sections, edits)
  if (Result.isFailure(resolved)) {
    return Result.fail(resolved.failure)
  }
  const outcomes = new Map<string, SectionEditOutcome>()
  let next = normalized
  const existing = resolved.success
    .filter(
      (edit): edit is ResolvedEdit & { readonly section: ParsedSection } =>
        edit.section !== undefined,
    )
    .toSorted((left, right) => right.section.start - left.section.start)
  for (const edit of existing) {
    const candidate = editExisting(next.split("\n"), edit)
    if (candidate === next) {
      outcomes.set(edit.heading, "skipped")
      continue
    }
    next = candidate
    outcomes.set(edit.heading, edit.mode === "replace" ? "replaced" : "appended")
  }
  for (const edit of resolved.success.filter((item) => item.section === undefined)) {
    next = insertNewSection(next, next.split("\n"), edit.heading, contentLinesOf(edit.content), 2)
    outcomes.set(edit.heading, "appended")
  }
  return Result.succeed({
    body: next === normalized ? body : next,
    sections: resolved.success.map((edit) => ({
      heading: edit.heading,
      mode: edit.mode,
      action: outcomes.get(edit.heading) ?? "skipped",
    })),
  })
}

export { editSections, SectionBatchError, type SectionEditResult }
