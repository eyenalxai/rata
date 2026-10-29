import type { IssueSummary } from "@/api/issue-model"

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

export { formatIssueLine }
