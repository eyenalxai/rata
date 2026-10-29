import { Effect, Option } from "effect"

import type { LinearClient } from "@/api/client"
import type { IssueCreateOptions, ResolvedLabel } from "@/api/issue-write/model"
import type { makeIssueWriteResolvers } from "@/api/issue-write/resolvers"
import type { RepoTeam } from "@/api/repo-team"
import type { IssueDefaults } from "@/config/defaults"
import type { RepoConfigService } from "@/config/repo"

import { createIssueMutation } from "@/api/issue-query"
import { CreateIssueResponse } from "@/api/issue-schema"
import { isNoneValue, unwrapIssue } from "@/api/issue-write/model"
import { issueDefaults } from "@/config/defaults"
import { currentDirectory } from "@/config/repo"
import { storedPriority } from "@/domain/priority"

type CreateDependencies = {
  readonly client: LinearClient["Service"]
  readonly repoConfig: RepoConfigService["Service"]
  readonly repoTeam: RepoTeam["Service"]
  readonly resolvers: ReturnType<typeof makeIssueWriteResolvers>
}

const labelsFor = (options: IssueCreateOptions, defaults: IssueDefaults): readonly string[] => [
  ...(options.useDefaultLabels === false ? [] : defaults.labels),
  ...(options.labels ?? []),
]

const assigneeFor = (options: IssueCreateOptions, defaults: IssueDefaults): string | null => {
  if (options.assignee === undefined) {
    return defaults.assignee
  }
  return isNoneValue(options.assignee) ? null : options.assignee
}

const priorityFor = (options: IssueCreateOptions, defaults: IssueDefaults): number | null => {
  if (options.priority === undefined) {
    return defaults.priority
  }
  return storedPriority(options.priority)
}

const makeCreateWrites = ({ client, repoConfig, repoTeam, resolvers }: CreateDependencies) => {
  const resolve = Effect.fn("IssueWriteApi.resolveCreate")(function* resolveCreate(
    options: IssueCreateOptions,
  ) {
    const config = Option.getOrUndefined(yield* repoConfig.read(yield* currentDirectory))
    const defaults = issueDefaults(config)
    const teamId = yield* repoTeam.resolve(options.team)
    const names = labelsFor(options, defaults)
    const resolved = names.length === 0 ? [] : yield* resolvers.resolveLabels(teamId, names)
    const resolvedLabels: ResolvedLabel[] = []
    const seenLabels = new Set<string>()
    for (const label of resolved) {
      if (!seenLabels.has(label.id)) {
        seenLabels.add(label.id)
        resolvedLabels.push(label)
      }
    }

    const input: Record<string, unknown> = { teamId, title: options.title }
    if (options.body !== undefined && options.body.length > 0) {
      input.description = options.body
    }
    if (resolvedLabels.length > 0) {
      input.labelIds = resolvedLabels.map((label) => label.id)
    }
    if (options.state !== undefined) {
      input.stateId = yield* resolvers.teamStateIdByName(teamId, options.state)
    }
    if (options.parent !== undefined) {
      input.parentId = yield* resolvers.resolveIssueId(options.parent)
    }
    const project = options.project ?? config?.project
    if (project !== undefined) {
      input.projectId = yield* resolvers.resolveProjectId(project)
    }
    const assignee = assigneeFor(options, defaults)
    if (assignee !== null) {
      input.assigneeId = yield* resolvers.resolveAssignee(assignee)
    }
    const priority = priorityFor(options, defaults)
    if (priority !== null) {
      input.priority = priority
    }

    return {
      input,
      plan: {
        team: options.team ?? config?.team ?? teamId,
        title: options.title,
        labels: resolvedLabels.map((label) => label.name),
        assignee,
        priority,
      },
    }
  })

  const create = Effect.fn("IssueWriteApi.create")(function* create(options: IssueCreateOptions) {
    const resolved = yield* resolve(options)
    const data = yield* client.execute(
      createIssueMutation,
      { input: resolved.input },
      CreateIssueResponse,
    )
    return yield* unwrapIssue(data.issueCreate)
  })

  const planCreate = Effect.fn("IssueWriteApi.planCreate")(function* planCreate(
    options: IssueCreateOptions,
  ) {
    const resolved = yield* resolve(options)
    return resolved.plan
  })

  return { create, planCreate }
}

export { makeCreateWrites }
