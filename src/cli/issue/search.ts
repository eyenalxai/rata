import { Effect, Option } from "effect"
import { Argument, Flag } from "effect/cli"
import { EOL } from "node:os"

import { requirePageSize } from "@/cli/input"
import { resolveIssueContext } from "@/cli/issue/context"
import { formatSummaryPage } from "@/cli/issue/format"
import { issueSummaryShape } from "@/cli/issue/shape"
import { afterFlag, allFlag } from "@/cli/list-flags"
import { nextPageHint } from "@/cli/output"
import { collectionOutput, defineCommand } from "@/cli/spec"
import { maxPageSize } from "@/linear/connection"
import { IssueReader } from "@/tracker/read"

const searchLimitFlag = Flag.Int("limit").pipe(
  Flag.withDescription(`Page size, at most ${maxPageSize}. Default: 10`),
  Flag.withDefault(10),
)

const searchSpec = defineCommand("search", {
  summary: "Search issues by text",
  examples: [
    {
      command: 'rata issue search "rate limit"',
      description: "Search the linked team and return ten summary rows",
    },
    {
      command: 'rata issue search "rate limit" --all --format json',
      description: "Drain every page of results",
    },
  ],
  input: {
    text: Argument.String("text").pipe(Argument.withDescription("Text to search for")),
    team: Flag.String("team").pipe(
      Flag.withDescription("Filter by team key or id. Defaults to the team from `rata link`"),
      Flag.optional,
    ),
    limit: searchLimitFlag,
    after: afterFlag,
    all: allFlag,
  },
  output: collectionOutput(issueSummaryShape),
  run: (input) =>
    Effect.gen(function* searchIssues() {
      yield* requirePageSize(input.limit)
      const reader = yield* IssueReader
      const context = yield* resolveIssueContext({
        team: Option.getOrUndefined(input.team),
        viewer: false,
      })
      const page = yield* reader.search(context, input.text, {
        after: Option.getOrNull(input.after),
        limit: input.limit,
        all: input.all,
      })
      const hint =
        page.pageInfo.hasNextPage && page.pageInfo.endCursor !== null
          ? `${EOL}${nextPageHint("issues", page.pageInfo.endCursor)}`
          : ""
      return {
        kind: "collection",
        key: "issues",
        items: page.issues,
        pageInfo: page.pageInfo,
        text: [formatSummaryPage(page.issues), hint].filter((line) => line.length > 0),
      }
    }),
})

export { searchSpec }
