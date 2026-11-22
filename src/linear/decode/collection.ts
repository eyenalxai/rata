import { Schema } from "effect"

import { IssueSummaryNode } from "@/linear/decode/issue"
import { PageInfo } from "@/linear/decode/page"

const ListResponse = Schema.Struct({
  issues: Schema.Struct({ nodes: Schema.Array(IssueSummaryNode), pageInfo: PageInfo }),
})

const SearchResponse = Schema.Struct({
  searchIssues: Schema.Struct({ nodes: Schema.Array(IssueSummaryNode), pageInfo: PageInfo }),
})

export { ListResponse, SearchResponse }
