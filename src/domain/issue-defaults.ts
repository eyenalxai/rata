import { Schema } from "effect"

import type { Priority } from "@/domain/priority"

import { PrioritySchema } from "@/domain/priority"

const IssueDefaults = Schema.Struct({
  assignee: Schema.NullOr(Schema.String),
  labels: Schema.Array(Schema.String),
  priority: Schema.NullOr(PrioritySchema),
})

type IssueDefaults = typeof IssueDefaults.Type

type DefaultsSource = {
  readonly defaultAssignee?: string | undefined
  readonly defaultLabels?: readonly string[] | undefined
  readonly defaultPriority?: Priority | undefined
}

const issueDefaults = (config?: DefaultsSource): IssueDefaults => ({
  assignee: config?.defaultAssignee ?? null,
  labels: config?.defaultLabels ?? [],
  priority: config?.defaultPriority ?? null,
})

export { IssueDefaults, issueDefaults }
