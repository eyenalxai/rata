import { EOL } from "node:os"

import type { PullRequest } from "@/domain/pr"
import type { IssueComment } from "@/linear/decode/issue"
import type {
  IssueReadDocument,
  IssueSummary,
  IssueWorkingChild,
  IssueWorkingChildFull,
  IssueWorkingSet,
  IssueWorkingSetFull,
} from "@/tracker/model"

import { formatIssueLine } from "@/cli/issue/line"

const linesForComment = (comment: IssueComment): string[] => {
  const author = comment.user?.name ?? "unknown"
  return [
    `  ${comment.createdAt} ${author}:`,
    ...comment.body.split(/\r?\n/u).map((bodyLine) => `    ${bodyLine}`),
  ]
}

const formatComments = (comments: readonly IssueComment[]): string[] => [
  "comments:",
  ...comments.flatMap(linesForComment),
]

const pullRequestState = (pull: PullRequest): string =>
  pull.draft === true || pull.status === "draft" ? "draft" : (pull.status ?? "unknown")

const formatPullRequest = (pull: PullRequest): string =>
  `  ${[
    pull.number === null ? null : `#${pull.number}`,
    pullRequestState(pull),
    pull.repo,
    pull.url,
  ]
    .filter((value): value is string => value !== null)
    .join("  ")}`

const formatHeader = (issue: IssueSummary): string[] => [
  `${issue.identifier}: ${issue.title}`,
  `state: ${issue.state.name} (${issue.state.type})`,
  ...(issue.priority === "none" ? [] : [`priority: ${issue.priority}`]),
  `assignee: ${issue.assignee?.name ?? "unassigned"}`,
  `labels: ${issue.labels.map((label) => label.name).join(", ") || "-"}`,
  ...(issue.project === null ? [] : [`project: ${issue.project.name}`]),
  ...(issue.parent === null ? [] : [`parent: ${issue.parent.identifier}: ${issue.parent.title}`]),
  `url: ${issue.url}`,
  `updatedAt: ${issue.updatedAt}`,
]

const formatChildLine = (child: IssueWorkingChild | IssueWorkingChildFull): string => {
  const blocked = child.blocked ? "blocked" : "ready"
  return `  ${child.identifier}  [${child.state.name}]  ${blocked}  ${child.title}`
}

const formatChildBlock = (title: string, children: readonly IssueWorkingChild[]): string[] =>
  children.length === 0 ? [] : [title, ...children.map(formatChildLine)]

const formatRelations = (relations: IssueWorkingSetFull["relations"]): string[] => {
  const groups = [
    ["blocks", relations.blocks],
    ["blockedBy", relations.blockedBy],
    ["duplicates", relations.duplicates],
    ["duplicatedBy", relations.duplicatedBy],
    ["related", relations.related],
    ["similar", relations.similar],
  ] as const
  const lines = groups
    .filter(([, targets]) => targets.length > 0)
    .map(
      ([name, targets]) =>
        `  ${name}: ${targets.map((target) => `${target.identifier} ${target.title}`).join(", ")}`,
    )
  return lines.length === 0 ? [] : ["relations:", ...lines]
}

const formatWorkingSet = (issue: IssueWorkingSet | IssueWorkingSetFull): string => {
  const body =
    issue.description !== null && issue.description.trim().length > 0 ? ["", issue.description] : []
  const sections =
    issue.sections.length === 0
      ? []
      : [
          "sections:",
          ...issue.sections.map((section) => `  ${"#".repeat(section.level)} ${section.heading}`),
        ]
  const openBlockers = issue.blockedBy.filter((blocker) => !blocker.closed)
  const blockers =
    openBlockers.length === 0
      ? []
      : [
          "open blockers:",
          ...openBlockers.map(
            (blocker) => `  ${blocker.identifier}  [${blocker.state.name}]  ${blocker.title}`,
          ),
        ]
  const prs = issue.prs.length === 0 ? ["prs: none"] : ["prs:", ...issue.prs.map(formatPullRequest)]
  const nextChild =
    issue.nextChild === null
      ? "next child: none"
      : `next child: ${formatChildLine(issue.nextChild).trimStart()}`
  return [
    ...formatHeader(issue),
    ...body,
    ...sections,
    ...blockers,
    issue.blocked ? "blocked: yes" : "blocked: no",
    ...prs,
    ...formatChildBlock("children:", issue.children),
    ...formatChildBlock("frontier:", issue.frontier),
    nextChild,
    ...(issue.comments === null
      ? []
      : issue.comments.length === 0
        ? ["comments: none"]
        : formatComments(issue.comments)),
    ...("relations" in issue && issue.relations !== undefined
      ? formatRelations(issue.relations)
      : []),
  ].join(EOL)
}

const isWorkingSet = (issue: IssueReadDocument): issue is IssueWorkingSet | IssueWorkingSetFull =>
  "description" in issue

const formatSummary = (issue: IssueSummary): string => formatHeader(issue).join(EOL)

const formatReadDocument = (issue: IssueReadDocument): string =>
  isWorkingSet(issue) ? formatWorkingSet(issue) : formatSummary(issue)

const formatSummaryPage = (issues: readonly IssueSummary[]): string =>
  issues.length === 0 ? "No issues found." : issues.map(formatIssueLine).join(EOL)

export { formatReadDocument, formatSummary, formatSummaryPage, formatWorkingSet }
