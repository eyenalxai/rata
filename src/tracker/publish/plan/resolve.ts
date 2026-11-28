import { Effect } from "effect"

import type { ResolvedContext } from "@/context/model"
import type { IssueId } from "@/domain/id"
import type { PublishDependencies, PublishPlanError } from "@/tracker/publish/model"
import type { ResolvedLabel } from "@/tracker/write/model"

import { parseRefOrFail } from "@/domain/issue-ref"
import { uniqueNames, uniqueValues } from "@/tracker/publish/plan/graph"

type ParentSummary = {
  readonly id: IssueId
  readonly updatedAt: string
}

const resolveTeam = (
  dependencies: PublishDependencies,
  context: ResolvedContext,
  team: string | undefined,
): Effect.Effect<ResolvedContext, PublishPlanError> =>
  team === undefined
    ? Effect.succeed(context)
    : dependencies.contexts.resolve({ team, viewer: true, requireTeam: true })

const readDocumentParent = (
  dependencies: PublishDependencies,
  parent: string | undefined,
): Effect.Effect<ParentSummary | null, PublishPlanError> =>
  parent === undefined
    ? Effect.succeed(null)
    : Effect.gen(function* readParent() {
        const ref = yield* parseRefOrFail(parent)
        const summary = yield* dependencies.gateway.issue.summary(ref)
        return { id: summary.id, updatedAt: summary.updatedAt }
      })

const resolveLabelMap = (
  dependencies: PublishDependencies,
  context: ResolvedContext,
  names: readonly string[],
): Effect.Effect<ReadonlyMap<string, ResolvedLabel>, PublishPlanError> =>
  names.length === 0
    ? Effect.succeed(new Map())
    : dependencies.resolvers
        .resolveLabels(context, names)
        .pipe(
          Effect.map(
            (labels) => new Map(labels.map((label) => [label.name.toLowerCase(), label] as const)),
          ),
        )

const resolveStateMap = (
  dependencies: PublishDependencies,
  context: ResolvedContext,
  names: readonly string[],
): Effect.Effect<ReadonlyMap<string, string>, PublishPlanError> =>
  Effect.forEach(uniqueNames(names), (name) =>
    dependencies.resolvers
      .teamStateIdByName(context, name)
      .pipe(Effect.map((id) => [name.toLowerCase(), String(id)] as const)),
  ).pipe(Effect.map((entries) => new Map(entries)))

const resolveAssigneeMap = (
  dependencies: PublishDependencies,
  context: ResolvedContext,
  values: readonly string[],
): Effect.Effect<ReadonlyMap<string, string>, PublishPlanError> =>
  Effect.forEach(uniqueValues(values), (value) =>
    dependencies.resolvers
      .resolveAssignee(context, value)
      .pipe(Effect.map((id) => [value, String(id)] as const)),
  ).pipe(Effect.map((entries) => new Map(entries)))

export {
  type ParentSummary,
  readDocumentParent,
  resolveAssigneeMap,
  resolveLabelMap,
  resolveStateMap,
  resolveTeam,
}
