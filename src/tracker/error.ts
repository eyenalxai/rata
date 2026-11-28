import { Schema } from "effect"

import { UserId } from "@/domain/id"

const filterNames = ["state", "label", "project"] as const
type FilterName = (typeof filterNames)[number]

class FilterNameNotFoundError extends Schema.TaggedError<FilterNameNotFoundError>()(
  "FilterNameNotFoundError",
  {
    code: Schema.tag("not_found"),
    filter: Schema.Literals(filterNames),
    value: Schema.String,
    valid: Schema.Array(Schema.String),
    message: Schema.String,
  },
) {}

class AssigneeInputError extends Schema.TaggedError<AssigneeInputError>()("AssigneeInputError", {
  code: Schema.tag("validation"),
  message: Schema.String,
}) {}

class AssigneeNotFoundError extends Schema.TaggedError<AssigneeNotFoundError>()(
  "AssigneeNotFoundError",
  {
    code: Schema.tag("not_found"),
    id: UserId,
    message: Schema.String,
  },
) {}

export { AssigneeInputError, AssigneeNotFoundError, type FilterName, FilterNameNotFoundError }
