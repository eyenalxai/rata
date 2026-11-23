import type { Effect } from "effect"

import type {
  IssueCreatePlan,
  IssueWriteApiError,
  IssueWriteResult,
  WriteOptions,
} from "@/tracker/write/model"
import type { IssueCreateOptions, IssueCreateResult } from "@/tracker/write/write-types"

type IssueWriteApiShape = {
  readonly create: (
    options: IssueCreateOptions,
  ) => Effect.Effect<IssueCreateResult, IssueWriteApiError>
  readonly planCreate: (
    options: IssueCreateOptions,
  ) => Effect.Effect<IssueCreatePlan, IssueWriteApiError>
  readonly close: (
    ref: string,
    body?: string,
    options?: WriteOptions,
  ) => Effect.Effect<IssueWriteResult, IssueWriteApiError>
}

export { type IssueWriteApiShape }
