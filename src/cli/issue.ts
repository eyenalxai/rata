import { Effect, Option } from "effect"
import { Argument, Command, Flag } from "effect/cli"

import { IssueApi } from "@/api/issue"
import { sortFields, stateTypes } from "@/api/issue-model"
import { OutputFields, readFields } from "@/cli/fields"
import { issueLabelCommand } from "@/cli/issue-label"
import { linkCommand, unlinkCommand } from "@/cli/issue-link"
import { writeIssuePage } from "@/cli/issue-page"
import { assignCommand, closeCommand, reopenCommand, unassignCommand } from "@/cli/issue-transition"
import { createCommand } from "@/cli/issue-write/create"
import { updateCommand } from "@/cli/issue-write/update"
import { commentCommand } from "@/cli/issue/comment"
import { sectionCommand } from "@/cli/issue/section"
import { showCommand } from "@/cli/issue/show"
import { statusCommand } from "@/cli/issue/status"
import { afterFlag, allFlag, limitFlag } from "@/cli/list-flags"
import { JsonOutput, reportFailure, validatePageSize } from "@/cli/output"
import { resolvePriority } from "@/cli/priority"

const optionalText = (name: string, description: string) =>
  Flag.String(name).pipe(Flag.withDescription(description), Flag.optional)

const listCommand = Command.make(
  "list",
  {
    team: optionalText("team", "Filter by team key or id. Defaults to the team from `rata link`"),
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
    sort: Flag.Literals("sort", sortFields).pipe(
      Flag.withDescription("Sort order: `priority` orders urgent first and none last"),
      Flag.optional,
    ),
    limit: limitFlag,
    after: afterFlag,
    all: allFlag,
  },
  (config) =>
    Effect.gen(function* list() {
      const json = yield* JsonOutput
      const fields = yield* readFields(json, yield* OutputFields)
      const valid = yield* validatePageSize(config.limit)
      if (!valid) {
        return
      }
      const priority = Option.getOrUndefined(yield* resolvePriority(config.priority))
      const api = yield* IssueApi
      const page = yield* api.list({
        team: Option.getOrUndefined(config.team),
        state: Option.getOrUndefined(config.state),
        stateType: Option.getOrUndefined(config.stateType),
        priority,
        label: Option.getOrUndefined(config.label),
        assignee: Option.getOrUndefined(config.assignee),
        project: Option.getOrUndefined(config.project),
        parent: Option.getOrUndefined(config.parent),
        text: Option.getOrUndefined(config.text),
        unblocked: config.unblocked,
        unassigned: config.unassigned,
        after: Option.getOrNull(config.after),
        sort: Option.getOrUndefined(config.sort),
        limit: config.limit,
        all: config.all,
      })
      yield* writeIssuePage(json, fields, page)
    }).pipe(Effect.catch(reportFailure)),
).pipe(
  Command.withDescription("List issues"),
  Command.withExamples([
    {
      command: "rata issue list --team RAT --label ready-for-agent",
      description: "List the ready tickets of one team",
    },
    {
      command: "rata issue list --parent RAT-1 --unblocked --unassigned --sort priority",
      description: "List the frontier of a map",
    },
    {
      command: "rata issue list --all --json",
      description: "Drain every page of matching issues",
    },
    {
      command: "rata issue list --limit 100 --after <cursor>",
      description: "Read the next page from the endCursor of the previous call",
    },
  ]),
)

const searchCommand = Command.make(
  "search",
  {
    text: Argument.String("text").pipe(Argument.withDescription("Text to search for")),
    team: optionalText("team", "Filter by team key or id. Defaults to the team from `rata link`"),
    limit: limitFlag,
    after: afterFlag,
    all: allFlag,
  },
  (config) =>
    Effect.gen(function* search() {
      const json = yield* JsonOutput
      const fields = yield* readFields(json, yield* OutputFields)
      const valid = yield* validatePageSize(config.limit)
      if (!valid) {
        return
      }
      const api = yield* IssueApi
      const page = yield* api.search(config.text, {
        team: Option.getOrUndefined(config.team),
        after: Option.getOrNull(config.after),
        limit: config.limit,
        all: config.all,
      })
      yield* writeIssuePage(json, fields, page)
    }).pipe(Effect.catch(reportFailure)),
).pipe(
  Command.withDescription("Search issues by text"),
  Command.withExamples([
    {
      command: 'rata search "rate limit"',
      description: "Search issues by text",
    },
    {
      command: 'rata search "rate limit" --all --json',
      description: "Drain every page of results",
    },
    {
      command: 'rata search "rate limit" --after <cursor>',
      description: "Read the next page of results",
    },
  ]),
  Command.withGlobalFlags([JsonOutput, OutputFields]),
)

const issueCommand = Command.make("issue").pipe(
  Command.withDescription("Read and write Linear issues"),
  Command.withSubcommands([
    listCommand,
    showCommand,
    statusCommand,
    createCommand,
    commentCommand,
    updateCommand,
    sectionCommand,
    issueLabelCommand,
    closeCommand,
    reopenCommand,
    assignCommand,
    unassignCommand,
    linkCommand,
    unlinkCommand,
  ]),
  Command.withGlobalFlags([JsonOutput, OutputFields]),
)

export { issueCommand, searchCommand }
