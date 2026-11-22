import { Schema } from "effect"

import { IssueId } from "@/domain/id"

const issueBodyQuery = `query IssueBody($id: String!) {
  issue(id: $id) {
    id
    identifier
    description
    updatedAt
  }
}`

const IssueBodyNode = Schema.Struct({
  id: IssueId,
  identifier: Schema.String,
  description: Schema.NullOr(Schema.String),
  updatedAt: Schema.String,
})
type IssueBodyNode = typeof IssueBodyNode.Type

const IssueBodyResponse = Schema.Struct({ issue: IssueBodyNode })

export { IssueBodyResponse, issueBodyQuery }
