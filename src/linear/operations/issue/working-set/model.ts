import type { IssueId } from "@/domain/id"
import type { IssueReadMode } from "@/domain/issue-read"
import type {
  IssueFullWorkingNode,
  IssueWorkingNode,
  WorkingSummaryNode,
} from "@/linear/decode/issue/working-set"
import type { PageInfo } from "@/linear/decode/page"

type IssueWorkingSetOptions = {
  readonly comments: boolean
  readonly mode: IssueReadMode
}

type IssueReadConnection =
  | {
      readonly mode: "summary"
      readonly nodes: readonly WorkingSummaryNode[]
      readonly pageInfo: PageInfo
    }
  | {
      readonly mode: "working"
      readonly nodes: readonly IssueWorkingNode[]
      readonly pageInfo: PageInfo
    }
  | {
      readonly mode: "full"
      readonly nodes: readonly IssueFullWorkingNode[]
      readonly pageInfo: PageInfo
    }

type ConnectionEntry<Item> = {
  readonly id: IssueId
  readonly items: readonly Item[]
  readonly hasNextPage: boolean
  readonly endCursor: string | null
}

type PendingConnection = {
  readonly id: IssueId
  readonly cursor: string
}

export {
  type ConnectionEntry,
  type IssueReadConnection,
  type IssueWorkingSetOptions,
  type PendingConnection,
}
