import { Effect, Result } from "effect"

import type { ResolvedContext } from "@/context/model"
import type { PublishDocument } from "@/domain/publish"
import type {
  PublishCreateNodePlan,
  PublishDependencies,
  PublishNodePlan,
  PublishPlan,
  PublishPlanError,
} from "@/tracker/publish/model"

import { TrackerError } from "@/domain/error"
import { publishOrder } from "@/domain/publish"
import { maxPageSize } from "@/linear/connection"
import { toSummary } from "@/tracker/model"
import { edgeStep, nodeStep, publishBatchSize } from "@/tracker/publish/model"
import {
  chunk,
  draftNodes,
  externalTokens,
  resolveReferences,
  toIssueRef,
  uniqueNames,
  uniqueValues,
} from "@/tracker/publish/plan/graph"
import {
  createInput,
  effectiveAssignee,
  effectiveLabels,
  effectiveState,
  makeEdges,
  resolvedNodeLabels,
} from "@/tracker/publish/plan/inputs"
import {
  readDocumentParent,
  resolveAssigneeMap,
  resolveLabelMap,
  resolveStateMap,
  resolveTeam,
} from "@/tracker/publish/plan/resolve"
import { requireTeamId } from "@/tracker/resolve"
import { isNoneValue } from "@/tracker/write/model"

const makePublishPlan = Effect.fn("IssuePublish.plan")(function* planPublishDocument(
  dependencies: PublishDependencies,
  context: ResolvedContext,
  document: PublishDocument,
): Effect.fn.Return<PublishPlan, PublishPlanError> {
  const ordered = publishOrder(document.nodes)
  if (Result.isFailure(ordered)) {
    return yield* ordered.failure
  }
  const keys = new Set(document.nodes.map((node) => node.key))
  if (document.parent !== undefined && keys.has(document.parent)) {
    return yield* new TrackerError({
      code: "validation",
      message: `The document parent ${document.parent} is a node key.`,
      hint: "Set the document parent to an existing issue reference.",
    })
  }
  const target = yield* resolveTeam(dependencies, context, document.team)
  const teamId = yield* requireTeamId(target)
  const parentSummary = yield* readDocumentParent(dependencies, document.parent)
  const tokens = externalTokens(document.nodes, keys).filter((token) => token !== document.parent)
  const references = new Map(yield* resolveReferences(dependencies, tokens))
  if (document.parent !== undefined && parentSummary !== null) {
    references.set(document.parent, parentSummary.id)
  }
  const drafts = yield* draftNodes(
    document.nodes,
    ordered.success,
    keys,
    references,
    document.parent,
    teamId,
  )
  const existing = yield* dependencies.gateway.issue.list({
    after: null,
    ids: drafts.map((draft) => toIssueRef(draft.id)),
    include: "relations",
    limit: maxPageSize,
    all: true,
  })
  const existingById = new Map(
    existing.nodes.map((node) => [String(node.id), toSummary(node)] as const),
  )
  const toCreate = drafts.filter((draft) => !existingById.has(draft.id))
  const labelNames = uniqueNames(
    toCreate.flatMap((draft) => effectiveLabels(draft.node, document, target)),
  )
  const stateNames = uniqueNames(
    toCreate.flatMap((draft) => {
      const state = effectiveState(draft.node, document)
      return state === undefined ? [] : [state]
    }),
  )
  const assigneeValues = uniqueValues(
    toCreate.flatMap((draft) => {
      const assignee = effectiveAssignee(draft.node, document, target)
      return assignee === undefined || assignee === null || isNoneValue(assignee) ? [] : [assignee]
    }),
  )
  const labels = yield* resolveLabelMap(dependencies, target, labelNames)
  const states = yield* resolveStateMap(dependencies, target, stateNames)
  const assignees = yield* resolveAssigneeMap(dependencies, target, assigneeValues)
  const nodes: PublishNodePlan[] = drafts.map((draft) => {
    const found = existingById.get(draft.id)
    if (found !== undefined) {
      return {
        key: draft.node.key,
        kind: draft.node.kind,
        title: draft.node.title,
        id: String(found.id),
        parent: draft.parent,
        labels: found.labels.map((label) => label.name),
        action: "reuse",
        existing: found,
        input: null,
      }
    }
    const nodeLabels = resolvedNodeLabels(draft.node, document, target, labels)
    return {
      key: draft.node.key,
      kind: draft.node.kind,
      title: draft.node.title,
      id: draft.id,
      parent: draft.parent,
      labels: nodeLabels.map((label) => label.name),
      action: "create",
      existing: null,
      input: createInput(draft, document, target, teamId, nodeLabels, states, assignees),
    }
  })
  const edges = makeEdges(drafts, references, existingById)
  const createNodes = nodes.filter(
    (node): node is PublishCreateNodePlan => node.action === "create",
  )
  const changed = [
    ...nodes.filter((node) => node.action === "create").map((node) => `node:${node.key}`),
    ...edges
      .filter((edge) => edge.action === "create")
      .map((edge) => `edge:${edge.to}:${edge.from}`),
  ]
  return {
    action: "publish",
    teamId,
    snapshot: parentSummary?.updatedAt ?? null,
    order: ordered.success,
    nodes,
    edges,
    batches: chunk(createNodes, publishBatchSize),
    changed,
    actions: [
      ...nodes.map((node) => nodeStep(node, node.action === "create" ? "updated" : "skipped")),
      ...edges.map((edge) => edgeStep(edge, edge.action === "create" ? "updated" : "skipped")),
    ],
  }
})

export { makePublishPlan }
