import { Effect } from "effect"

import type { ApplyDocument } from "@/domain/apply"
import type { SectionEditAction } from "@/domain/section"
import type { LinearClientShape } from "@/linear/client"
import type { IssueWorkingSetFull } from "@/tracker/model"
import type { ApplyPlanError, PlannedAction, PlanStep } from "@/tracker/plan"

import { editSections } from "@/domain/body/section/batch"
import { UpdateIssueResponse } from "@/linear/decode/issue"
import { updateIssueMutation } from "@/tracker/write/documents"
import { unwrapIssue } from "@/tracker/write/model"

type SectionDependencies = {
  readonly client: LinearClientShape
}

const sectionAction = (ref: string, action: SectionEditAction, content: string): PlannedAction => ({
  action: action.mode === "replace" ? "section-replace" : "section-append",
  target: ref,
  status: action.action === "skipped" ? "skipped" : "updated",
  changes: { heading: action.heading, content },
})

const planSectionStep = (
  dependencies: SectionDependencies,
  ref: string,
  snapshot: IssueWorkingSetFull,
  document: ApplyDocument,
): Effect.Effect<PlanStep | null, ApplyPlanError> => {
  const sections = document.sections
  if (sections === undefined || sections.length === 0) {
    return Effect.succeed(null)
  }
  return Effect.gen(function* planSectionWrite() {
    const edited = yield* Effect.fromResult(editSections(snapshot.description ?? "", sections))
    const contentByHeading = new Map(
      sections.map((section) => [section.heading.trim(), section.content]),
    )
    const actions = edited.sections.map((action) =>
      sectionAction(ref, action, contentByHeading.get(action.heading) ?? ""),
    )
    const changed = edited.sections
      .filter((action) => action.action !== "skipped")
      .map((action) => `section:${action.heading}`)
    const status = changed.length === 0 ? "skipped" : "updated"
    return {
      action: "update-sections",
      target: ref,
      status,
      changes: {
        sections: edited.sections
          .filter((action) => action.action !== "skipped")
          .map((action) => ({ heading: action.heading, mode: action.mode })),
      },
      changed,
      actions,
      execute:
        status === "skipped"
          ? Effect.void
          : dependencies.client
              .execute(
                updateIssueMutation,
                { id: snapshot.id, input: { description: edited.body } },
                UpdateIssueResponse,
              )
              .pipe(Effect.flatMap((data) => unwrapIssue(data.issueUpdate))),
    }
  })
}

export { planSectionStep }
