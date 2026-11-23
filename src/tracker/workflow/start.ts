import { Effect } from "effect"

import type { ResolvedContext } from "@/context/model"
import type { ApplyPlanError } from "@/tracker/apply/model"
import type { ApplyPlan } from "@/tracker/plan"
import type { StartOptions, WorkflowDependencies } from "@/tracker/workflow/model"

import { TrackerError } from "@/domain/error"
import { stateByType } from "@/domain/workflow-state"
import { readApplySnapshot } from "@/tracker/apply"

const planStart = (
  dependencies: WorkflowDependencies,
  context: ResolvedContext,
  ref: string,
  options: StartOptions,
): Effect.Effect<ApplyPlan, ApplyPlanError> =>
  Effect.gen(function* planStartWork() {
    const snapshot = yield* readApplySnapshot(dependencies.reader, ref)
    const viewer = context.viewer
    if (viewer === null) {
      return yield* new TrackerError({
        code: "auth",
        message: "The viewer is unknown.",
        hint: "Run `rata auth login` first.",
      })
    }
    const assignee = snapshot.assignee
    const heldByViewer = assignee?.id === viewer.id
    const heldByOther = assignee !== null && !heldByViewer
    if (heldByOther && options.take !== true) {
      return yield* new TrackerError({
        code: "conflict",
        message: `${snapshot.identifier} is held by ${assignee.name}.`,
        hint: "Pass --take to reassign it.",
      })
    }
    const claim = assignee === null || heldByOther
    const state = options.state ?? stateByType(context.states, "started")?.name
    if (state === undefined) {
      return yield* new TrackerError({
        code: "validation",
        message: "The team has no started state.",
        hint: "Set a started state in Linear, or pass --state.",
      })
    }
    return yield* dependencies.apply.plan(
      context,
      ref,
      { ...(claim ? { assignee: "me" } : {}), state },
      { command: "start", snapshot },
    )
  })

export { planStart }
