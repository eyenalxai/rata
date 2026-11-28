import { Effect } from "effect"

import type { ResolvedContext } from "@/context/model"
import type { ApplyDocument } from "@/domain/apply"
import type { ApplyPlan, ApplyPlanError } from "@/tracker/plan"
import type { WorkflowDependencies } from "@/tracker/workflow/model"

import { TrackerError } from "@/domain/error"

const planHandoff = (
  dependencies: WorkflowDependencies,
  context: ResolvedContext,
  ref: string,
  document: ApplyDocument,
  pr: string,
): Effect.Effect<ApplyPlan, ApplyPlanError> => {
  const url = pr.trim()
  if (url.length === 0) {
    return Effect.fail(
      new TrackerError({
        code: "validation",
        message: "The handoff PR URL is empty.",
        hint: "Pass a GitHub pull request URL in the pr field.",
      }),
    )
  }
  return dependencies.apply.plan(context, ref, document, { command: "handoff", pr: url })
}

export { planHandoff }
