import { Schema } from "effect"

import { IssueId } from "@/domain/id"
import { IssueInverseRelationConnection, IssueRelationConnection } from "@/linear/decode/issue"
import { PageInfo } from "@/linear/decode/page"

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
  id: IssueId,
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
