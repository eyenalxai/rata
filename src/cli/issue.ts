import { Effect, Option } from "effect"
import { Argument, Command, Flag } from "effect/cli"

import type { IssueDetail, IssuePage, IssueRelations, IssueSummary } from "@/api/issue-model"
import type { IssueChild } from "@/api/issue-schema"

import { IssueApi } from "@/api/issue"
import { sortFields, stateTypes } from "@/api/issue-model"
import { maxPageSize } from "@/api/pagination"
import { issueLabelCommand } from "@/cli/issue-label"
import { linkCommand, unlinkCommand } from "@/cli/issue-link"
import { assignCommand, closeCommand, reopenCommand, unassignCommand } from "@/cli/issue-transition"
import { commentCommand, createCommand, updateCommand } from "@/cli/issue-write"
import { nextPageHint, reportFailure, validatePageSize, writeJson, writeLine } from "@/cli/output"
import { resolvePriority } from "@/cli/priority"

const jsonFlag = Flag.Boolean("json").pipe(
  Flag.withDescription("Print machine-readable JSON"),
  Flag.withDefault(false),
)

const limitFlag = Flag.Int("limit").pipe(
  Flag.withDescription(`Page size, at most ${maxPageSize}`),
  Flag.withDefault(50),
)

const afterFlag = Flag.String("after").pipe(
  Flag.withDescription("Continue after this cursor"),
  Flag.optional,
)

const optionalText = (name: string, description: string) =>
  Flag.String(name).pipe(Flag.withDescription(description), Flag.optional)

const refArgument = Argument.String("ref").pipe(
  Argument.withDescription("Issue reference: an identifier, a UUID, or a linear.app URL"),
)

const formatIssueLine = (issue: IssueSummary): string => {
  const assignee = issue.assignee?.name ?? "unassigned"
  const labels = issue.labels.map((label) => label.name).join(",") || "-"
  const priorityColumns = issue.priority === "none" ? [] : [issue.priority]
  return [
    issue.identifier,
    `[${issue.state.name}]`,
    ...priorityColumns,
    assignee,
    labels,
    issue.title,
  ].join("  ")
}

const formatRelations = (relations: IssueRelations): string[] => {
  const lines: string[] = []
  const groups: readonly (readonly [string, readonly IssueChild[]])[] = [
    ["blocks", relations.blocks],
    ["blockedBy", relations.blockedBy],
    ["duplicates", relations.duplicates],
    ["duplicatedBy", relations.duplicatedBy],
    ["related", relations.related],
    ["similar", relations.similar],
  ]
  for (const [name, targets] of groups) {
    if (targets.length > 0) {
      const text = targets.map((target) => `${target.identifier} ${target.title}`).join(", ")
      lines.push(`  ${name}: ${text}`)
    }
  }
  return lines
}

const formatIssueDetail = (issue: IssueDetail): string => {
  const lines: string[] = [
    `${issue.identifier}: ${issue.title}`,
    `state: ${issue.state.name} (${issue.state.type})`,
    `priority: ${issue.priority}`,
    `labels: ${issue.labels.map((label) => label.name).join(", ") || "-"}`,
  ]
  if (issue.assignee !== null) {
    lines.push(`assignee: ${issue.assignee.name}`)
  }
  if (issue.project !== null) {
    lines.push(`project: ${issue.project.name}`)
  }
  if (issue.parent !== null) {
    lines.push(`parent: ${issue.parent.identifier}: ${issue.parent.title}`)
  }
  if (issue.description !== null && issue.description.trim().length > 0) {
    lines.push("", issue.description)
  }
  if (issue.children.length > 0) {
    lines.push("children:")
    for (const child of issue.children) {
      lines.push(`  ${child.identifier}  [${child.state.name}]  ${child.title}`)
    }
  }
  const relationLines = formatRelations(issue.relations)
  if (relationLines.length > 0) {
    lines.push("relations:", ...relationLines)
  }
  if (issue.comments !== undefined && issue.comments.length > 0) {
    lines.push("comments:")
    for (const comment of issue.comments) {
      const author = comment.user?.name ?? "unknown"
      lines.push(`  ${comment.createdAt} ${author}:`)
      for (const bodyLine of comment.body.split(/\r?\n/u)) {
        lines.push(`    ${bodyLine}`)
      }
    }
  }
  return lines.join("\n")
}

const writeHumanPage = (page: IssuePage): Effect.Effect<void> =>
  page.issues.length === 0
    ? writeLine("No issues found.")
    : Effect.forEach(page.issues, (issue) => writeLine(formatIssueLine(issue)), { discard: true })

const writeIssuePage = (config: { readonly json: boolean }, page: IssuePage) =>
  Effect.gen(function* writePage() {
    if (config.json) {
      yield* writeJson(page)
      return
    }
    yield* writeHumanPage(page)
    if (page.pageInfo.hasNextPage && page.pageInfo.endCursor !== null) {
      yield* writeLine(nextPageHint("issues", page.pageInfo.endCursor))
    }
  })

const listCommand = Command.make(
  "list",
  {
    team: optionalText("team", "Filter by team key or id"),
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
    json: jsonFlag,
  },
  (config) =>
    Effect.gen(function* list() {
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
      })
      yield* writeIssuePage(config, page)
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
      command: "rata issue list --limit 100 --after <cursor>",
      description: "Read the next page from the endCursor of the previous call",
    },
  ]),
)

const showCommand = Command.make(
  "show",
  {
    ref: refArgument,
    comments: Flag.Boolean("comments").pipe(
      Flag.withDescription("Include the issue comments"),
      Flag.withDefault(false),
    ),
    json: jsonFlag,
  },
  (config) =>
    Effect.gen(function* show() {
      const api = yield* IssueApi
      const issue = yield* api.show(config.ref, { comments: config.comments })
      if (config.json) {
        return yield* writeJson({ issue })
      }
      return yield* writeLine(formatIssueDetail(issue))
    }).pipe(Effect.catch(reportFailure)),
).pipe(
  Command.withDescription("Show one issue"),
  Command.withExamples([
    {
      command: "rata issue show RAT-42 --comments",
      description: "Show one issue with its comments",
    },
  ]),
)

const searchCommand = Command.make(
  "search",
  {
    text: Argument.String("text").pipe(Argument.withDescription("Text to search for")),
    limit: limitFlag,
    after: afterFlag,
    json: jsonFlag,
  },
  (config) =>
    Effect.gen(function* search() {
      const valid = yield* validatePageSize(config.limit)
      if (!valid) {
        return
      }
      const api = yield* IssueApi
      const page = yield* api.search(config.text, {
        after: Option.getOrNull(config.after),
        limit: config.limit,
      })
      yield* writeIssuePage(config, page)
    }).pipe(Effect.catch(reportFailure)),
).pipe(
  Command.withDescription("Search issues by text"),
  Command.withExamples([
    {
      command: 'rata search "rate limit"',
      description: "Search issues by text",
    },
    {
      command: 'rata search "rate limit" --after <cursor>',
      description: "Read the next page of results",
    },
  ]),
)

const issueCommand = Command.make("issue").pipe(
  Command.withDescription("Read and write Linear issues"),
  Command.withSubcommands([
    listCommand,
    showCommand,
    createCommand,
    commentCommand,
    updateCommand,
    issueLabelCommand,
    closeCommand,
    reopenCommand,
    assignCommand,
    unassignCommand,
    linkCommand,
    unlinkCommand,
  ]),
)

export { issueCommand, searchCommand }
