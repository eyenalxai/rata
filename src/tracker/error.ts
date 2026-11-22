import { Schema } from "effect"

import { UserId } from "@/domain/id"

const filterNames = ["state", "label", "project"] as const
type FilterName = (typeof filterNames)[number]

class FilterNameNotFoundError extends Schema.TaggedError<FilterNameNotFoundError>()(
  "FilterNameNotFoundError",
  {
    filter: Schema.Literals(filterNames),
    value: Schema.String,
    valid: Schema.Array(Schema.String),
    message: Schema.String,
  },
) {}

class AssigneeInputError extends Schema.TaggedError<AssigneeInputError>()("AssigneeInputError", {
  message: Schema.String,
}) {}

class AssigneeNotFoundError extends Schema.TaggedError<AssigneeNotFoundError>()(
  "AssigneeNotFoundError",
  {
    id: UserId,
    message: Schema.String,
  },
) {}

export { AssigneeInputError, AssigneeNotFoundError, type FilterName, FilterNameNotFoundError }
