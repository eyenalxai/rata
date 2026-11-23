import { Context, Effect, Layer } from "effect"

import type { IssueWorkflowShape } from "@/tracker/workflow/model"

import { IssueApply } from "@/tracker/apply"
import { IssueReader } from "@/tracker/read"
import { planClose } from "@/tracker/workflow/close"
import { planHandoff } from "@/tracker/workflow/handoff"
import { planStart } from "@/tracker/workflow/start"

class IssueWorkflow extends Context.Service<IssueWorkflow, IssueWorkflowShape>()(
  "rata-cli/tracker/workflow/IssueWorkflow",
) {
  static readonly layer = Layer.effect(
    IssueWorkflow,
    Effect.gen(function* issueWorkflowLayer() {
      const reader = yield* IssueReader
      const apply = yield* IssueApply
      const dependencies = { reader, apply }
      return IssueWorkflow.of({
        start: (context, ref, options) => planStart(dependencies, context, ref, options),
        handoff: (context, ref, document, pr) =>
          planHandoff(dependencies, context, ref, document, pr),
        close: (context, ref, options) => planClose(dependencies, context, ref, options),
      })
    }),
  )
}

export { IssueWorkflow, type IssueWorkflowShape }
