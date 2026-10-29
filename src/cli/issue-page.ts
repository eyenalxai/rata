import type { Option } from "effect"

import { Effect } from "effect"

import type { IssuePage, IssueSummary } from "@/api/issue-model"
import type { FieldPath } from "@/cli/fields"

import { selectItems } from "@/cli/fields"
import { nextPageHint, writeJson, writeLine } from "@/cli/output"

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

const writeHumanPage = (page: IssuePage): Effect.Effect<void> =>
  page.issues.length === 0
    ? writeLine("No issues found.")
    : Effect.forEach(page.issues, (issue) => writeLine(formatIssueLine(issue)), { discard: true })

const writeIssuePage = (
  json: boolean,
  fields: Option.Option<readonly FieldPath[]>,
  page: IssuePage,
) =>
  Effect.gen(function* writePage() {
    if (json) {
      yield* writeJson({
        issues: yield* selectItems(fields, page.issues),
        pageInfo: page.pageInfo,
      })
      return
    }
    yield* writeHumanPage(page)
    if (page.pageInfo.hasNextPage && page.pageInfo.endCursor !== null) {
      yield* writeLine(nextPageHint("issues", page.pageInfo.endCursor))
    }
  })

export { writeIssuePage }
