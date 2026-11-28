import type { ContextResolver } from "@/context/resolve"
import type { ApplyDocument, ApplyRelations } from "@/domain/apply"
import type { SectionBatchError } from "@/domain/body/section/batch"
import type { TrackerError } from "@/domain/error"
import type { LinearClientShape } from "@/linear/client"
import type { LinearGatewayShape } from "@/linear/gateway"
import type { AssigneeInputError } from "@/tracker/error"
import type { IssueWorkingSetFull } from "@/tracker/model"
import type { ApplyCommand } from "@/tracker/plan"
import type { IssueReader } from "@/tracker/read"
import type { makeCommentWrites } from "@/tracker/write/comments"
import type { IssueWriteApiError } from "@/tracker/write/model"
import type { makeIssueWriteResolvers } from "@/tracker/write/resolvers"

type ApplyDependencies = {
  readonly client: LinearClientShape
  readonly gateway: LinearGatewayShape
  readonly contexts: ContextResolver["Service"]
  readonly reader: IssueReader["Service"]
  readonly resolvers: ReturnType<typeof makeIssueWriteResolvers>
  readonly comments: ReturnType<typeof makeCommentWrites>
}

type ApplyPlanError = AssigneeInputError | IssueWriteApiError | SectionBatchError | TrackerError

type ApplyDocumentContext = {
  readonly ref: string
  readonly document: ApplyDocument
  readonly snapshot: IssueWorkingSetFull
}

type ApplyPlanOptions = {
  readonly command?: ApplyCommand | undefined
  readonly removeRelations?: boolean | undefined
  readonly snapshot?: IssueWorkingSetFull | undefined
  readonly pr?: string | undefined
}

type RelationDocument = ApplyRelations

export {
  type ApplyDependencies,
  type ApplyDocumentContext,
  type ApplyPlanError,
  type ApplyPlanOptions,
  type RelationDocument,
}
