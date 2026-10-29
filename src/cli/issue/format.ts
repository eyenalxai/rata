import type { IssueDetail, IssueRelations, IssueStatus, IssueSummary } from "@/api/issue-model"
import type { IssueChild } from "@/api/issue-schema"
import type { PullRequest } from "@/domain/pr"

import { formatIssueLine } from "@/cli/issue/line"

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

const formatIssueHeader = (issue: IssueSummary): string[] => {
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
  lines.push(`url: ${issue.url}`, `updatedAt: ${issue.updatedAt}`)
  return lines
}

const formatIssueDetail = (issue: IssueDetail, showBody: boolean): string => {
  const lines = formatIssueHeader(issue)
  if (showBody && issue.description !== null && issue.description.trim().length > 0) {
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
  if (issue.attachments.length > 0) {
    lines.push("attachments:")
    for (const attachment of issue.attachments) {
      const source = attachment.subtitle ?? attachment.sourceType
      const prefix = source === null ? attachment.title : `${attachment.title} (${source})`
      lines.push(`  ${prefix}  ${attachment.url}`)
    }
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

const formatIssueSummary = (issue: IssueSummary): string => formatIssueHeader(issue).join("\n")

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

const formatIssueStatus = (status: IssueStatus): string => {
  const { issue } = status
  const lines: string[] = [
    `${issue.identifier}: ${issue.title}`,
    `state: ${issue.state.name} (${issue.state.type})`,
    `priority: ${issue.priority}`,
    `assignee: ${issue.assignee?.name ?? "unassigned"}`,
    `blocked: ${status.blocked ? "yes" : "no"}`,
  ]
  const openBlockers = status.blockedBy.filter((blocker) => !blocker.closed)
  if (openBlockers.length > 0) {
    lines.push("open blockers:")
    for (const blocker of openBlockers) {
      lines.push(`  ${blocker.identifier}  [${blocker.state.name}]  ${blocker.title}`)
    }
  }
  if (status.prs.length === 0) {
    lines.push("prs: none")
  } else {
    lines.push("prs:")
    for (const pull of status.prs) {
      lines.push(formatPullRequest(pull))
    }
  }
  lines.push(
    status.nextChild === null
      ? "next child: none"
      : `next child: ${formatIssueLine(status.nextChild)}`,
  )
  return lines.join("\n")
}

export { formatIssueDetail, formatIssueStatus, formatIssueSummary }
