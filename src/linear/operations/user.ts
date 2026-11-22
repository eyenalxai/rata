import { Effect, Schema } from "effect"

import type { UserId } from "@/domain/id"
import type { LinearClientShape } from "@/linear/client"
import type { LinearApiError } from "@/linear/errors"

import { UserConnection } from "@/linear/decode/user"
import { userByIdQuery } from "@/linear/documents/user"

type UserReadOperations = {
  readonly byId: (id: UserId) => Effect.Effect<UserId | undefined, LinearApiError>
}

const makeUserOperations = (execute: LinearClientShape["execute"]): UserReadOperations => {
  const byId = Effect.fn("LinearUser.byId")(function* findUserById(id: UserId) {
    const data = yield* execute(userByIdQuery, { id }, Schema.Struct({ users: UserConnection }))
    return data.users.nodes[0]?.id
  })

  return { byId }
}

export { makeUserOperations, type UserReadOperations }
