import type { Effect } from "effect"

import type { ResolvedContext } from "@/context/model"
import type { IssueCreatePlan, IssueWriteApiError } from "@/tracker/write/model"
import type { IssueCreateOptions, IssueCreateResult } from "@/tracker/write/write-types"

type IssueWriterShape = {
  readonly create: (
    context: ResolvedContext,
    options: IssueCreateOptions,
  ) => Effect.Effect<IssueCreateResult, IssueWriteApiError>
  readonly planCreate: (
    context: ResolvedContext,
    options: IssueCreateOptions,
  ) => Effect.Effect<IssueCreatePlan, IssueWriteApiError>
}

export { type IssueWriterShape }
