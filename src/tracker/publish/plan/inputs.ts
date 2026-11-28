import type { ResolvedContext } from "@/context/model"
import type { IssueId, TeamId } from "@/domain/id"
import type { Priority } from "@/domain/priority"
import type { PublishDocument, PublishNode } from "@/domain/publish"
import type { IssueSummary } from "@/tracker/model"
import type { PublishEdgePlan } from "@/tracker/publish/model"
import type { DraftNode } from "@/tracker/publish/plan/graph"
import type { ResolvedLabel } from "@/tracker/write/model"

import { priorityValue } from "@/domain/priority"
import { isNoneValue } from "@/tracker/write/model"

const defaultLabels = (document: PublishDocument, context: ResolvedContext): readonly string[] =>
  document.defaults?.labels ?? context.defaults.labels

const effectiveLabels = (
  node: PublishNode,
  document: PublishDocument,
  context: ResolvedContext,
): readonly string[] => [...defaultLabels(document, context), ...(node.labels ?? [])]

const effectivePriority = (
  node: PublishNode,
  document: PublishDocument,
  context: ResolvedContext,
): Priority | null => node.priority ?? document.defaults?.priority ?? context.defaults.priority

const contextAssignee = (context: ResolvedContext): string | undefined =>
  context.defaults.assignee ?? undefined

const effectiveAssignee = (
  node: PublishNode,
  document: PublishDocument,
  context: ResolvedContext,
): string | null | undefined => {
  if (node.assignee !== undefined) {
    return node.assignee
  }
  if (document.defaults?.assignee !== undefined) {
    return document.defaults.assignee
  }
  return contextAssignee(context)
}

const effectiveState = (node: PublishNode, document: PublishDocument): string | undefined =>
  node.state ?? document.defaults?.state

const resolvedNodeLabels = (
  node: PublishNode,
  document: PublishDocument,
  context: ResolvedContext,
  labels: ReadonlyMap<string, ResolvedLabel>,
): readonly ResolvedLabel[] => {
  const resolved: ResolvedLabel[] = []
  const seen = new Set<string>()
  for (const name of effectiveLabels(node, document, context)) {
    const label = labels.get(name.toLowerCase())
    if (label === undefined) {
      throw new Error(`The label ${name} was not resolved before the publish plan.`)
    }
    if (!seen.has(String(label.id))) {
      seen.add(String(label.id))
      resolved.push(label)
    }
  }
  return resolved
}

const createInput = (
  draft: DraftNode,
  document: PublishDocument,
  context: ResolvedContext,
  teamId: TeamId,
  labels: readonly ResolvedLabel[],
  states: ReadonlyMap<string, string>,
  assignees: ReadonlyMap<string, string>,
): Readonly<Record<string, unknown>> => {
  const input: Record<string, unknown> = {
    id: draft.id,
    teamId,
    title: draft.node.title,
  }
  if (draft.node.body !== undefined && draft.node.body.length > 0) {
    input.description = draft.node.body
  }
  if (draft.parentId !== null) {
    input.parentId = draft.parentId
  }
  if (labels.length > 0) {
    input.labelIds = labels.map((label) => String(label.id))
  }
  const state = effectiveState(draft.node, document)
  if (state !== undefined) {
    const stateId = states.get(state.toLowerCase())
    if (stateId === undefined) {
      throw new Error(`The state ${state} was not resolved before the publish plan.`)
    }
    input.stateId = stateId
  }
  const assignee = effectiveAssignee(draft.node, document, context)
  if (assignee === null || (assignee !== undefined && isNoneValue(assignee))) {
    input.assigneeId = null
  } else if (assignee !== undefined) {
    const assigneeId = assignees.get(assignee)
    if (assigneeId === undefined) {
      throw new Error(`The assignee ${assignee} was not resolved before the publish plan.`)
    }
    input.assigneeId = assigneeId
  }
  const priority = effectivePriority(draft.node, document, context)
  if (priority !== null) {
    input.priority = priorityValue(priority)
  }
  return input
}

const makeEdges = (
  drafts: readonly DraftNode[],
  references: ReadonlyMap<string, IssueId>,
  existing: ReadonlyMap<string, IssueSummary>,
): readonly PublishEdgePlan[] => {
  const byKey = new Map(drafts.map((draft) => [draft.node.key, draft] as const))
  const edges: PublishEdgePlan[] = []
  const seen = new Set<string>()
  for (const draft of drafts) {
    const blocked = existing.get(draft.id)
    const present = new Set((blocked?.relations?.blockedBy ?? []).map((issue) => String(issue.id)))
    for (const blocker of draft.node.blockedBy ?? []) {
      const fromId = byKey.get(blocker)?.id ?? references.get(blocker)
      if (fromId === undefined) {
        throw new Error(`The blocker ${blocker} was not resolved before the publish plan.`)
      }
      const id = `${draft.id}\0${fromId}`
      if (seen.has(id) || fromId === draft.id) {
        continue
      }
      seen.add(id)
      edges.push({
        from: blocker,
        to: draft.node.key,
        fromId,
        toId: draft.id,
        action: present.has(fromId) ? "skip" : "create",
      })
    }
  }
  return edges
}

export {
  createInput,
  effectiveAssignee,
  effectiveLabels,
  effectiveState,
  makeEdges,
  resolvedNodeLabels,
}
