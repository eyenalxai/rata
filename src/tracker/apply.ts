import { Context, Effect, Layer } from "effect"

import type { ResolvedContext } from "@/context/model"
import type { ApplyDocument } from "@/domain/apply"
import type { ApplyDependencies, ApplyPlanOptions } from "@/tracker/apply/model"
import type { IssueReadDocument, IssueWorkingSetFull } from "@/tracker/model"
import type { ApplyPlan } from "@/tracker/plan"

import { TrackerError } from "@/domain/error"
import { planCommentStep } from "@/tracker/apply/comment"
import { planFieldStep } from "@/tracker/apply/fields"
import { planLabelSteps } from "@/tracker/apply/labels"
import { planRelationSteps } from "@/tracker/apply/relations"
import { planSectionStep } from "@/tracker/apply/sections"
import { toTrackerError } from "@/tracker/error-report"
import { IssueReader } from "@/tracker/read"
import { IssueWriter } from "@/tracker/write"

type IssueApplyShape = {
  readonly plan: (
    context: ResolvedContext,
    ref: string,
    document: ApplyDocument,
    options?: ApplyPlanOptions,
  ) => Effect.Effect<ApplyPlan, TrackerError>
}

const isFullWorkingSet = (document: IssueReadDocument): document is IssueWorkingSetFull =>
  "description" in document && "relations" in document

const internalError = (message: string) =>
  new TrackerError({ code: "internal", message, hint: null })

const readSnapshot = (
  reader: IssueReader["Service"],
  ref: string,
): Effect.Effect<IssueWorkingSetFull, TrackerError> =>
  Effect.gen(function* readApplySnapshot() {
    const page = yield* reader
      .workingSet([ref], { comments: false, mode: "full" })
      .pipe(Effect.mapError(toTrackerError))
    const document = page.items[0]
    if (document === undefined || !isFullWorkingSet(document)) {
      return yield* internalError(`The read of ${ref} did not return the full working set.`)
    }
    return document
  })

const planIssue = (
  dependencies: ApplyDependencies,
  context: ResolvedContext,
  ref: string,
  document: ApplyDocument,
  options: ApplyPlanOptions,
): Effect.Effect<ApplyPlan, TrackerError> =>
  Effect.gen(function* planIssueDocument() {
    const snapshot = yield* readSnapshot(dependencies.reader, ref)
    const fields = yield* planFieldStep(dependencies, context, ref, snapshot, document)
    const labels = yield* planLabelSteps(dependencies, context, ref, snapshot, document)
    const sections = yield* planSectionStep(ref, snapshot, document)
    const comment = yield* planCommentStep(dependencies, ref, snapshot, document)
    const relations = yield* planRelationSteps(dependencies, ref, snapshot, document, options)
    return {
      identifier: snapshot.identifier,
      snapshot: snapshot.updatedAt,
      steps: [
        ...(fields === null ? [] : [fields]),
        ...labels,
        ...(sections === null ? [] : [sections]),
        ...(comment === null ? [] : [comment]),
        ...relations,
      ],
    }
  })

class IssueApply extends Context.Service<IssueApply, IssueApplyShape>()(
  "rata-cli/tracker/apply/IssueApply",
) {
  static readonly layer = Layer.effect(
    IssueApply,
    Effect.gen(function* issueApplyLayer() {
      const reader = yield* IssueReader
      const writer = yield* IssueWriter
      const dependencies: ApplyDependencies = { reader, writer }
      return IssueApply.of({
        plan: Effect.fn("IssueApply.plan")(function* plan(context, ref, document, options = {}) {
          return yield* planIssue(dependencies, context, ref, document, options)
        }),
      })
    }),
  )
}

export { IssueApply, type IssueApplyShape }
