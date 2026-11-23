import { Context, Effect, Layer } from "effect"

import type { ResolvedContext } from "@/context/model"
import type { ApplyDocument } from "@/domain/apply"
import type { ApplyDependencies, ApplyPlanError, ApplyPlanOptions } from "@/tracker/apply/model"
import type { IssueReadDocument, IssueWorkingSetFull } from "@/tracker/model"
import type { ApplyCommand, ApplyPlan } from "@/tracker/plan"

import { ContextResolver } from "@/context/resolve"
import { TrackerError } from "@/domain/error"
import { LinearGateway } from "@/linear/gateway"
import { planCommentStep } from "@/tracker/apply/comment"
import { planFieldStep } from "@/tracker/apply/fields"
import { planLabelSteps } from "@/tracker/apply/labels"
import { planRelationSteps } from "@/tracker/apply/relations"
import { planSectionStep } from "@/tracker/apply/sections"
import { IssueReader } from "@/tracker/read"
import { makeCommentWrites } from "@/tracker/write/comments"
import { makeIssueWriteResolvers } from "@/tracker/write/resolvers"
import { makeVisibilityChecks } from "@/tracker/write/visibility"

type IssueApplyShape = {
  readonly plan: (
    context: ResolvedContext,
    ref: string,
    document: ApplyDocument,
    options?: ApplyPlanOptions,
  ) => Effect.Effect<ApplyPlan, ApplyPlanError>
}

const isFullWorkingSet = (document: IssueReadDocument): document is IssueWorkingSetFull =>
  "description" in document && "relations" in document

const internalError = (message: string) =>
  new TrackerError({ code: "internal", message, hint: null })

const readSnapshot = (
  reader: IssueReader["Service"],
  ref: string,
): Effect.Effect<IssueWorkingSetFull, ApplyPlanError> =>
  Effect.gen(function* readApplySnapshot() {
    const page = yield* reader.workingSet([ref], { comments: false, mode: "full" })
    const document = page.items[0]
    if (document === undefined || !isFullWorkingSet(document)) {
      return yield* internalError(`The read of ${ref} did not return the full working set.`)
    }
    return document
  })

const makePlan = (
  command: ApplyCommand,
  dependencies: ApplyDependencies,
  context: ResolvedContext,
  ref: string,
  document: ApplyDocument,
  options: ApplyPlanOptions,
): Effect.Effect<ApplyPlan, ApplyPlanError> =>
  Effect.gen(function* planIssueDocument() {
    const snapshot = yield* readSnapshot(dependencies.reader, ref)
    const fields = yield* planFieldStep(dependencies, context, ref, snapshot, document)
    const labels = yield* planLabelSteps(dependencies, context, ref, snapshot, document)
    const sections = yield* planSectionStep(dependencies, ref, snapshot, document)
    const comment = yield* planCommentStep(dependencies, ref, snapshot, document)
    const relations = yield* planRelationSteps(dependencies, ref, snapshot, document, options)
    return {
      action: command,
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
      const gateway = yield* LinearGateway
      const contexts = yield* ContextResolver
      const reader = yield* IssueReader
      const client = gateway.client
      const resolvers = makeIssueWriteResolvers({ client, contexts, gateway })
      const comments = makeCommentWrites({
        client,
        resolvers,
        visibility: makeVisibilityChecks({ client }),
      })
      const dependencies: ApplyDependencies = {
        client,
        gateway,
        contexts,
        reader,
        resolvers,
        comments,
      }
      return IssueApply.of({
        plan: (context, ref, document, options = {}) =>
          makePlan(options.command ?? "apply", dependencies, context, ref, document, options),
      })
    }),
  )
}

export { IssueApply, type IssueApplyShape }
