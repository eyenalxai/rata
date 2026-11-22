import { Schema } from "effect"

const PageInfo = Schema.Struct({
  hasNextPage: Schema.Boolean,
  endCursor: Schema.NullOr(Schema.String),
})

type PageInfo = typeof PageInfo.Type

export { PageInfo }
