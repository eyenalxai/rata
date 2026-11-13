import { Schema } from "effect"

import { IssueInverseRelationConnection, IssueRelationConnection } from "@/api/issue-schema"
import { PageInfo } from "@/api/pagination"

const RelationsResponse = Schema.Struct({
  issue: Schema.Struct({ relations: IssueRelationConnection }),
})

const InverseRelationsResponse = Schema.Struct({
  issue: Schema.Struct({ inverseRelations: IssueInverseRelationConnection }),
})

const RelationsWithInverseResponse = Schema.Struct({
  issue: Schema.Struct({
    relations: IssueRelationConnection,
    inverseRelations: IssueInverseRelationConnection,
  }),
})

const IssueRefNode = Schema.Struct({
  id: Schema.String,
  identifier: Schema.String,
})

const IssueRefsResponse = Schema.Struct({
  issues: Schema.Struct({
    nodes: Schema.Array(IssueRefNode),
    pageInfo: PageInfo,
  }),
})

export {
  InverseRelationsResponse,
  IssueRefsResponse,
  RelationsResponse,
  RelationsWithInverseResponse,
}
