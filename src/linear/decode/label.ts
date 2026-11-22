import { Schema } from "effect"

import { Label } from "@/domain/label"
import { PageInfo } from "@/linear/decode/page"

const LabelConnection = Schema.Struct({
  nodes: Schema.Array(Label),
  pageInfo: PageInfo,
})

const LabelPayload = Schema.Struct({
  success: Schema.Boolean,
  issueLabel: Schema.NullOr(Label),
})

export { LabelConnection, LabelPayload }
