import { Schema } from "effect"

import { UserId } from "@/domain/id"

const UserConnection = Schema.Struct({
  nodes: Schema.Array(Schema.Struct({ id: UserId })),
})

export { UserConnection }
