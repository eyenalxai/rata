import { EOL } from "node:os"

import type { PullRequest } from "@/domain/pr"
import type { IssueComment } from "@/linear/decode/issue"
import type {
  IssueHeader,
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

const formatHeader = (issue: IssueHeader): string[] => [
  `${issue.identifier}: ${issue.title}`,
  `state: ${issue.state.name} (${issue.state.type})`,
  ...(issue.priority === "none" ? [] : [`priority: ${issue.priority}`]),
  `assignee: ${issue.assignee?.name ?? "unassigned"}`,
  ...(issue.project === null ? [] : [`project: ${issue.project.name}`]),
  ...(issue.parent === null ? [] : [`parent: ${issue.parent.identifier}: ${issue.parent.title}`]),
]

const formatChildLine = (child: IssueWorkingChild | IssueWorkingChildFull): string => {
  const blocked = child.blocked ? "blocked" : "ready"
  return `  ${child.identifier}  [${child.state.name}]  ${blocked}  ${child.title}`
}

const formatChildBlock = (title: string, children: readonly IssueWorkingChild[]): string[] =>
  children.length === 0 ? [] : [title, ...children.map(formatChildLine)]

const formatWorkingSet = (issue: IssueWorkingSet | IssueWorkingSetFull): string => {
  const full =
    "url" in issue
      ? [
          `url: ${issue.url}`,
          `updatedAt: ${issue.updatedAt}`,
          `labels: ${issue.labels.map((label) => label.name).join(", ") || "-"}`,
        ]
      : []
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
      : `next child: ${formatChildLine(issue.nextChild)}`
  return [
    ...formatHeader(issue),
    ...full,
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
  ].join(EOL)
}

const formatSummary = (issue: IssueHeader): string => formatHeader(issue).join(EOL)

const formatSummaryPage = (issues: readonly IssueSummary[]): string =>
  issues.length === 0 ? "No issues found." : issues.map(formatIssueLine).join(EOL)

export { formatSummary, formatSummaryPage, formatWorkingSet }
