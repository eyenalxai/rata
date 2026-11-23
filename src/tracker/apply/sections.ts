import { Effect, Result } from "effect"

import type { ApplyDocument } from "@/domain/apply"
import type { ApplyPlanError } from "@/tracker/apply/model"
import type { IssueWorkingSetFull } from "@/tracker/model"
import type { ApplyStep, PlannedAction } from "@/tracker/plan"

import { appendSection, replaceSection } from "@/domain/body/section/edit"
import { availableHeadings, findMatches, parseBody } from "@/domain/body/section/model"
import { normalizeLineEndings } from "@/domain/body/text"
import { TrackerError } from "@/domain/error"

type SectionAction = {
  readonly heading: string
  readonly mode: "replace" | "append"
  readonly status: "updated" | "skipped"
}

const validationError = (message: string, hint: string | null = null) =>
  new TrackerError({ code: "validation", message, hint })

const conflictError = (message: string, hint: string | null = null) =>
  new TrackerError({ code: "conflict", message, hint })

const missingSection = (heading: string, available: readonly string[]) =>
  new TrackerError({
    code: "not_found",
    message: `No section named "${heading}".`,
    hint:
      available.length === 0
        ? "The issue body has no headings."
        : `Available headings: ${available.map((item) => `"${item}"`).join(", ")}.`,
  })

const sectionAction = (
  ref: string,
  section: SectionAction,
  document: { readonly content: string },
): PlannedAction => ({
  action: section.mode === "replace" ? "section-replace" : "section-append",
  target: ref,
  status: section.status,
  changes: { heading: section.heading, content: document.content },
})

const planSectionStep = (
  ref: string,
  snapshot: IssueWorkingSetFull,
  document: ApplyDocument,
): Effect.Effect<ApplyStep | null, ApplyPlanError> => {
  const sections = document.sections
  if (sections === undefined || sections.length === 0) {
    return Effect.succeed(null)
  }
  return Effect.gen(function* planSectionWrite() {
    const current = normalizeLineEndings(snapshot.description ?? "")
    const parsed = parseBody(current)
    const seen = new Set<string>()
    const actions: SectionAction[] = []
    let next = current
    for (const section of sections) {
      const heading = section.heading.trim()
      if (heading.length === 0) {
        return yield* validationError("The section heading is empty.")
      }
      if (seen.has(heading)) {
        return yield* conflictError(
          `The document edits the section "${heading}" more than once.`,
          "Keep one edit for each heading.",
        )
      }
      seen.add(heading)
      const matches = findMatches(parsed.sections, heading)
      if (matches.length > 1) {
        return yield* conflictError(
          `Heading "${heading}" appears ${matches.length} times.`,
          "Rename one heading, or use a heading that appears once.",
        )
      }
      if (section.mode === "replace" && matches.length === 0) {
        return yield* missingSection(heading, availableHeadings(parsed.sections))
      }
      const candidate =
        section.mode === "replace"
          ? replaceSection(next, heading, section.content)
          : appendSection(next, heading, section.content, 2)
      if (Result.isFailure(candidate)) {
        return yield* new TrackerError({
          code: "conflict",
          message: candidate.failure.message,
          hint: "Rename one heading, or use a heading that appears once.",
        })
      }
      if (candidate.success === next) {
        actions.push({ heading, mode: section.mode, status: "skipped" })
        continue
      }
      next = candidate.success
      actions.push({ heading, mode: section.mode, status: "updated" })
    }
    const updated = actions.filter((action) => action.status === "updated")
    const status = updated.length === 0 ? "skipped" : "updated"
    return {
      action: "update-sections",
      target: ref,
      status,
      changes: {
        sections: actions
          .filter((action) => action.status === "updated")
          .map((action) => ({ heading: action.heading, mode: action.mode })),
      },
      changed: updated.map((action) => `section:${action.heading}`),
      actions: actions.map((action) => {
        const source = sections.find((section) => section.heading.trim() === action.heading)
        return sectionAction(ref, action, {
          content: source?.content ?? "",
        })
      }),
      issueId: snapshot.id,
      description: next,
    }
  })
}

export { planSectionStep }
