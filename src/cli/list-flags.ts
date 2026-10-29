import { Flag } from "effect/cli"

import { maxPageSize } from "@/api/pagination"

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

export { afterFlag, allFlag, limitFlag }
