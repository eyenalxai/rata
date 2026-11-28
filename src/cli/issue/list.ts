import { Effect, Option } from "effect"
import { Flag } from "effect/cli"
import { EOL } from "node:os"

import { requirePageSize } from "@/cli/input"
import { resolveIssueContext } from "@/cli/issue/context"
import { formatSummaryPage } from "@/cli/issue/format"
import { issueSummaryRelationsShape } from "@/cli/issue/shape"
import { afterFlag, allFlag, limitFlag } from "@/cli/list-flags"
import { nextPageHint } from "@/cli/output"
import { resolvePriority } from "@/cli/priority"
import { collectionOutput, defineCommand } from "@/cli/spec"
import { stateTypes } from "@/domain/workflow-state"
import { sortFields } from "@/tracker/model"
import { IssueReader } from "@/tracker/read"

const optionalText = (name: string, description: string) =>
  Flag.String(name).pipe(Flag.withDescription(description), Flag.optional)

const listSpec = defineCommand("list", {
  summary: "List issues",
  examples: [
    {
      command: "rata issue list --label ready-for-agent --format json",
      description: "List the ready tickets of one team",
    },
    {
      command: "rata issue list --parent RAT-1 --unblocked --unassigned --sort priority",
      description: "List the frontier of a map",
    },
    {
      command: "rata issue list --limit 100 --after <cursor>",
      description: "Read the next page from the endCursor of the previous call",
    },
  ],
  input: {
    team: optionalText(
      "team",
      "Filter by team key or id. Defaults to the team from `rata admin link`",
    ),
    state: optionalText("state", "Filter by workflow state name"),
    stateType: Flag.Literals("state-type", stateTypes).pipe(
      Flag.withDescription("Filter by workflow state type"),
      Flag.optional,
    ),
    priority: optionalText("priority", "Priority: none, urgent, high, medium, low, or 0-4"),
    label: optionalText("label", "Filter by label name"),
    assignee: optionalText("assignee", "Filter by assignee: `me` or a user id"),
    project: optionalText("project", "Filter by project id or name"),
    parent: optionalText("parent", "Filter by parent issue reference"),
    text: optionalText("text", "Filter by text in the title or the description"),
    unblocked: Flag.Boolean("unblocked").pipe(
      Flag.withDescription("Keep only open issues with no open blocker"),
      Flag.withDefault(false),
    ),
    unassigned: Flag.Boolean("unassigned").pipe(
      Flag.withDescription("Keep only issues with no assignee"),
      Flag.withDefault(false),
    ),
    relations: Flag.Boolean("relations").pipe(
      Flag.withDescription("Add the six relation groups to each row"),
      Flag.withDefault(false),
    ),
    sort: Flag.Literals("sort", sortFields).pipe(
      Flag.withDescription(
        "Sort order: `priority` orders urgent first and none last; ties go to the oldest",
      ),
      Flag.optional,
    ),
    limit: limitFlag,
    after: afterFlag,
    all: allFlag,
  },
  output: collectionOutput(issueSummaryRelationsShape),
  run: (input) =>
    Effect.gen(function* listIssues() {
      yield* requirePageSize(input.limit)
      const priority = Option.getOrUndefined(yield* resolvePriority(input.priority))
      const reader = yield* IssueReader
      const context = yield* resolveIssueContext({
        team: Option.getOrUndefined(input.team),
        viewer: false,
      })
      const page = yield* reader.list(context, {
        team: Option.getOrUndefined(input.team),
        state: Option.getOrUndefined(input.state),
        stateType: Option.getOrUndefined(input.stateType),
        priority,
        label: Option.getOrUndefined(input.label),
        assignee: Option.getOrUndefined(input.assignee),
        project: Option.getOrUndefined(input.project),
        parent: Option.getOrUndefined(input.parent),
        text: Option.getOrUndefined(input.text),
        unblocked: input.unblocked,
        unassigned: input.unassigned,
        include: input.relations ? "relations" : undefined,
        after: Option.getOrNull(input.after),
        sort: Option.getOrUndefined(input.sort),
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
        text: [`${formatSummaryPage(page.issues)}${hint}`],
      }
    }),
})

export { listSpec }
