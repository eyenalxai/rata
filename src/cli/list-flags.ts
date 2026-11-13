import { Effect, Option } from "effect"
import { Flag } from "effect/cli"

import { maxPageSize } from "@/api/pagination"
import { errorLine } from "@/cli/output"

const limitFlag = Flag.Int("limit").pipe(
  Flag.withDescription(`Page size, at most ${maxPageSize}`),
  Flag.withDefault(50),
)

const afterFlag = Flag.String("after").pipe(
  Flag.withDescription("Continue after this cursor"),
  Flag.optional,
)

const allFlag = Flag.Boolean("all").pipe(
  Flag.withDescription("Drain every page; --limit stays the page size"),
  Flag.withDefault(false),
)

const countFlag = Flag.Boolean("count").pipe(
  Flag.withDescription("Print the number of matching issues; drains every page"),
  Flag.withDefault(false),
)

const idsOnlyFlag = Flag.Boolean("ids-only").pipe(
  Flag.withDescription("Print one issue identifier per line as plain text"),
  Flag.withDefault(false),
)

type ListOutputFlags = {
  readonly json: boolean
  readonly fields: Option.Option<string>
  readonly count: boolean
  readonly idsOnly: boolean
}

const validateListOutput = Effect.fn("Cli.ListFlags.validateOutput")(function* validateListOutput(
  flags: ListOutputFlags,
) {
  if (flags.count && flags.idsOnly) {
    yield* errorLine(
      "validation",
      "The --count and --ids-only flags cannot be combined.",
      "Use `--count` for one number, or `--ids-only` for one identifier per line.",
    )
    return false
  }
  if (flags.count && Option.isSome(flags.fields)) {
    yield* errorLine(
      "validation",
      "The --count flag is not valid with --fields.",
      "Remove --fields from the count call.",
    )
    return false
  }
  if (flags.idsOnly && (flags.json || Option.isSome(flags.fields))) {
    yield* errorLine(
      "validation",
      "The --ids-only flag prints plain text and is not valid with --json or --fields.",
      "Remove --json or --fields, or use `--json --fields identifier` for JSON.",
    )
    return false
  }
  return true
})

export {
  afterFlag,
  allFlag,
  countFlag,
  idsOnlyFlag,
  limitFlag,
  type ListOutputFlags,
  validateListOutput,
}
