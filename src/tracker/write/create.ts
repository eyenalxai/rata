import { Effect } from "effect"

import type { ResolvedContext } from "@/context/model"
import type { IssueId } from "@/domain/id"
import type { IssueDefaults } from "@/domain/issue-defaults"
import type { Priority } from "@/domain/priority"
import type { LinearClientShape } from "@/linear/client"
import type { ResolvedLabel } from "@/tracker/write/model"
import type { makeIssueWriteResolvers } from "@/tracker/write/resolvers"
import type { makeVisibilityChecks } from "@/tracker/write/visibility"
import type { IssueCreateOptions } from "@/tracker/write/write-types"

import { priorityValue } from "@/domain/priority"
import { CreateIssueResponse } from "@/linear/decode/issue"
import { requireTeamId } from "@/tracker/resolve"
import { createIssueMutation } from "@/tracker/write/documents"
import { isNoneValue, unwrapIssue } from "@/tracker/write/model"

type CreateDependencies = {
  readonly client: LinearClientShape
  readonly resolvers: ReturnType<typeof makeIssueWriteResolvers>
  readonly visibility: ReturnType<typeof makeVisibilityChecks>
}

const labelsFor = (options: IssueCreateOptions, defaults: IssueDefaults): readonly string[] => [
  ...defaults.labels,
  ...(options.labels ?? []),
]

const assigneeFor = (options: IssueCreateOptions, defaults: IssueDefaults): string | null => {
  if (options.assignee === undefined) {
    return defaults.assignee
  }
  return isNoneValue(options.assignee) ? null : options.assignee
}

const priorityFor = (options: IssueCreateOptions, defaults: IssueDefaults): Priority | null => {
  const priority = options.priority ?? defaults.priority
  return priority === "none" ? null : priority
}

const dedupeLabels = (labels: readonly ResolvedLabel[]): readonly ResolvedLabel[] => {
  const seen = new Set<string>()
  const unique: ResolvedLabel[] = []
  for (const label of labels) {
    if (!seen.has(label.id)) {
      seen.add(label.id)
      unique.push(label)
    }
  }
  return unique
}

const makeCreateWrites = ({ client, resolvers, visibility }: CreateDependencies) => {
  const resolve = Effect.fn("IssueWriter.resolveCreate")(function* resolveCreate(
    context: ResolvedContext,
    options: IssueCreateOptions,
  ) {
    const teamId = yield* requireTeamId(context)
    const names = labelsFor(options, context.defaults)
    const resolved = names.length === 0 ? [] : yield* resolvers.resolveLabels(context, names)
    const labels = dedupeLabels(resolved)

    const input: Record<string, unknown> = { teamId, title: options.title }
    if (options.body !== undefined && options.body.length > 0) {
      input.description = options.body
    }
    if (labels.length > 0) {
      input.labelIds = labels.map((label) => label.id)
    }
    if (options.state !== undefined) {
      input.stateId = yield* resolvers.teamStateIdByName(context, options.state)
    }
    let parentId: IssueId | null = null
    if (options.parent !== undefined) {
      parentId = yield* resolvers.resolveIssueId(options.parent)
      input.parentId = parentId
    }
    const project = options.project ?? context.project
    if (project !== null) {
      input.projectId = yield* resolvers.resolveProjectId(project)
    }
    const assignee = assigneeFor(options, context.defaults)
    if (assignee !== null) {
      input.assigneeId = yield* resolvers.resolveAssignee(context, assignee)
    }
    const priority = priorityFor(options, context.defaults)
    if (priority !== null) {
      input.priority = priorityValue(priority)
    }

    return {
      input,
      parentId,
      plan: {
        team: options.team ?? context.storedTeam ?? teamId,
        title: options.title,
        labels: labels.map((label) => label.name),
        assignee,
        priority,
      },
    }
  })

  const create = Effect.fn("IssueWriter.create")(function* create(
    context: ResolvedContext,
    options: IssueCreateOptions,
  ) {
    const { input, parentId } = yield* resolve(context, options)
    const data = yield* client.execute(createIssueMutation, { input }, CreateIssueResponse)
    const issue = yield* unwrapIssue(data.issueCreate)
    const visible =
      parentId === null
        ? null
        : yield* visibility.waitForChild(parentId, issue.id, options.waitSeconds)
    return { issue, visible }
  })

  const planCreate = Effect.fn("IssueWriter.planCreate")(function* planCreate(
    context: ResolvedContext,
    options: IssueCreateOptions,
  ) {
    const resolved = yield* resolve(context, options)
    return resolved.plan
  })

  return { create, planCreate }
}

export { makeCreateWrites }
