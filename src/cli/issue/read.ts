import { Effect } from "effect"
import { Argument, Flag } from "effect/cli"
import { EOL } from "node:os"

import type { IssueReadMode } from "@/tracker/model"

import { formatReadDocument } from "@/cli/issue/format"
import { issueReadShapes } from "@/cli/issue/shape"
import { collectionOutput, defineCommand, selectOutput } from "@/cli/spec"
import { TrackerError } from "@/domain/error"
import { IssueReader } from "@/tracker/read"

const summaryFlag = Flag.Boolean("summary").pipe(
  Flag.withDescription(
    "Summary fields only: identity, state, priority, labels, URLs and timestamps",
  ),
  Flag.withDefault(false),
)

const fullFlag = Flag.Boolean("full").pipe(
  Flag.withDescription("Add relations and full child rows"),
  Flag.withDefault(false),
)

const commentsFlag = Flag.Boolean("comments").pipe(
  Flag.withDescription("Include the comments"),
  Flag.withDefault(false),
)

const readSpec = defineCommand("issue", {
  summary: "Read the working set of one or more issues",
  examples: [
    {
      command: "rata issue RAT-42",
      description: "Start a session with the body, sections, blockers, PRs, children and frontier",
    },
    {
      command: "rata issue RAT-42 --comments --format json",
      description: "Add the comments to the working set",
    },
    {
      command: "rata issue RAT-42 --summary",
      description: "Read the summary fields only",
    },
    {
      command: "rata issue RAT-1 RAT-2 RAT-3",
      description: "Read a known set in one list request per page",
    },
  ],
  input: {
    refs: Argument.String("ref").pipe(
      Argument.withDescription("Issue references: identifiers, UUIDs, or linear.app URLs"),
      Argument.atLeast(1),
    ),
    summary: summaryFlag,
    full: fullFlag,
    comments: commentsFlag,
  },
  output: [selectOutput(issueReadShapes.full), collectionOutput(issueReadShapes.full)],
  outputFor: (input) => {
    const shape = input.summary
      ? issueReadShapes.summary
      : input.full
        ? issueReadShapes.full
        : issueReadShapes.working
    return [selectOutput(shape), collectionOutput(shape)]
  },
  run: (input) =>
    Effect.gen(function* readIssues() {
      if (input.summary && input.full) {
        return yield* new TrackerError({
          code: "validation",
          message: "--summary and --full are mutually exclusive.",
          hint: "Drop one of the two flags.",
        })
      }
      if (input.summary && input.comments) {
        return yield* new TrackerError({
          code: "validation",
          message: "--summary and --comments are mutually exclusive.",
          hint: "Drop --comments, or read the full working set.",
        })
      }
      const mode: IssueReadMode = input.summary ? "summary" : input.full ? "full" : "working"
      const reader = yield* IssueReader
      const page = yield* reader.workingSet(input.refs, {
        comments: input.comments,
        mode,
      })
      if (page.items.length === 1 && input.refs.length === 1) {
        const issue = page.items[0]
        if (issue === undefined) {
          return yield* new TrackerError({
            code: "internal",
            message: "The working-set read returned no issue.",
            hint: null,
          })
        }
        return {
          kind: "resource",
          value: issue,
          text: [formatReadDocument(issue)],
        }
      }
      return {
        kind: "collection",
        key: "items",
        items: page.items,
        pageInfo: page.pageInfo,
        text: [page.items.map(formatReadDocument).join(`${EOL}${EOL}`)],
      }
    }),
})

export { readSpec }
