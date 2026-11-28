import type { Effect } from "effect"

import type { ResolvedContext } from "@/context/model"
import type { ApplyDocument } from "@/domain/apply"
import type { IssueApplyShape } from "@/tracker/apply"
import type { ApplyPlan, ApplyPlanError } from "@/tracker/plan"
import type { IssueReader } from "@/tracker/read"

type StartOptions = {
  readonly state?: string | undefined
  readonly take?: boolean | undefined
}

type CloseOptions = {
  readonly comment?: string | undefined
  readonly force?: boolean | undefined
}

type IssueWorkflowShape = {
  readonly start: (
    context: ResolvedContext,
    ref: string,
    options: StartOptions,
  ) => Effect.Effect<ApplyPlan, ApplyPlanError>
  readonly handoff: (
    context: ResolvedContext,
    ref: string,
    document: ApplyDocument,
    pr: string,
  ) => Effect.Effect<ApplyPlan, ApplyPlanError>
  readonly close: (
    context: ResolvedContext,
    ref: string,
    options: CloseOptions,
  ) => Effect.Effect<ApplyPlan, ApplyPlanError>
}

type WorkflowDependencies = {
  readonly reader: IssueReader["Service"]
  readonly apply: IssueApplyShape
}

export { type CloseOptions, type IssueWorkflowShape, type StartOptions, type WorkflowDependencies }
