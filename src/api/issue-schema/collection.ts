import { Schema } from "effect"

import { IssueSummaryNode } from "@/api/issue-schema"
import { PageInfo } from "@/api/pagination"

const ListResponse = Schema.Struct({
  issues: Schema.Struct({ nodes: Schema.Array(IssueSummaryNode), pageInfo: PageInfo }),
})

const SearchResponse = Schema.Struct({
  searchIssues: Schema.Struct({ nodes: Schema.Array(IssueSummaryNode), pageInfo: PageInfo }),
})

export { ListResponse, SearchResponse }
