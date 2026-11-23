import { Effect } from "effect"
import { createHash } from "node:crypto"

import type { ResolvedContext } from "@/context/model"
import type { ApplyDocument } from "@/domain/apply"
import type { ApplyPlanError } from "@/tracker/apply/model"
import type { ApplyPlan } from "@/tracker/plan"
import type { CloseOptions, WorkflowDependencies } from "@/tracker/workflow/model"

import { TrackerError } from "@/domain/error"
import { isClosedState, stateByType } from "@/domain/workflow-state"
import { readApplySnapshot } from "@/tracker/apply"

const closeDedupeKey = (body: string): string =>
  `close:${createHash("sha256").update(body).digest("hex")}`

const planClose = (
  dependencies: WorkflowDependencies,
  context: ResolvedContext,
  ref: string,
  options: CloseOptions,
): Effect.Effect<ApplyPlan, ApplyPlanError> =>
  Effect.gen(function* planCloseWork() {
    const snapshot = yield* readApplySnapshot(dependencies.reader, ref)
    const comment = options.comment?.trim()
    if (comment !== undefined && comment.length === 0) {
      return yield* new TrackerError({
        code: "validation",
        message: "The close comment is empty.",
        hint: "Pass a non-empty comment, or omit the comment file.",
      })
    }
    const closed = isClosedState(snapshot.state.type)
    const openChildren = closed
      ? []
      : snapshot.children.filter((child) => !isClosedState(child.state.type))
    if (openChildren.length > 0 && options.force !== true) {
      return yield* new TrackerError({
        code: "conflict",
        message: `${snapshot.identifier} has open children: ${openChildren
          .map((child) => child.identifier)
          .join(", ")}.`,
        hint: "Close the children first, or pass --force.",
      })
    }
    const state = closed ? undefined : stateByType(context.states, "completed")?.name
    if (!closed && state === undefined) {
      return yield* new TrackerError({
        code: "validation",
        message: "The team has no completed state.",
        hint: "Set a completed state in Linear.",
      })
    }
    const commentDocument =
      comment === undefined ? undefined : { body: comment, dedupeKey: closeDedupeKey(comment) }
    const document: ApplyDocument = {
      ...(state === undefined ? {} : { state }),
      ...(commentDocument === undefined ? {} : { comment: commentDocument }),
    }
    return yield* dependencies.apply.plan(context, ref, document, { command: "close", snapshot })
  })

export { closeDedupeKey, planClose }
