import { Effect, Result } from "effect"

import type { PlanStatus } from "@/domain/plan"
import type { LinearClientShape } from "@/linear/client"
import type {
  FailedPublishAction,
  PublishEdgeResult,
  PublishNodeResult,
  PublishPlan,
  PublishResult,
} from "@/tracker/publish/model"

import { TrackerError } from "@/domain/error"
import { CreateRelationResponse, IssueBatchCreateResponse } from "@/linear/decode/issue"
import { issueBatchCreateMutation } from "@/tracker/publish/documents"
import { edgeStep, nodeStep } from "@/tracker/publish/model"
import { createRelationMutation } from "@/tracker/write/documents"

type NodeResults = ReadonlyMap<string, PublishNodeResult>

type MutableNodeResults = Map<string, PublishNodeResult>

const initialNodeResult = (node: PublishPlan["nodes"][number]): PublishNodeResult => ({
  key: node.key,
  kind: node.kind,
  title: node.title,
  id: node.id,
  identifier: node.action === "reuse" ? node.existing.identifier : null,
  parent: node.parent,
  labels: node.labels,
  action: node.action,
})

const initialNodeResults = (plan: PublishPlan): MutableNodeResults =>
  new Map(
    plan.nodes.map(
      (node) =>
        [
          node.key,
          {
            ...initialNodeResult(node),
            action: node.action === "reuse" ? "reused" : "create",
          },
        ] as const,
    ),
  )

const initialEdgeResults = (plan: PublishPlan): PublishEdgeResult[] =>
  plan.edges.map((edge) => ({ from: edge.from, to: edge.to, action: edge.action }))

const nodeResult = (nodes: NodeResults, key: string): PublishNodeResult => {
  const result = nodes.get(key)
  if (result === undefined) {
    throw new Error(`The publish result is missing the node ${key}.`)
  }
  return result
}

const nodesInOrder = (plan: PublishPlan, nodes: NodeResults): readonly PublishNodeResult[] =>
  plan.nodes.map((node) => nodeResult(nodes, node.key))

const statusOfNode = (action: PublishNodeResult["action"]): PlanStatus | undefined => {
  if (action === "reused") {
    return "skipped"
  }
  return action === "created" ? "updated" : undefined
}

const statusOfEdge = (action: PublishEdgeResult["action"]): PlanStatus | undefined => {
  if (action === "skipped") {
    return "skipped"
  }
  return action === "created" ? "updated" : undefined
}

const actionsFrom = (
  plan: PublishPlan,
  nodes: NodeResults,
  edges: readonly PublishEdgeResult[],
): readonly PublishPlan["actions"][number][] => [
  ...plan.nodes.flatMap((node) => {
    const status = statusOfNode(nodeResult(nodes, node.key).action)
    return status === undefined ? [] : [nodeStep(node, status)]
  }),
  ...plan.edges.flatMap((edge, index) => {
    const status = statusOfEdge(edges[index]?.action ?? "create")
    return status === undefined ? [] : [edgeStep(edge, status)]
  }),
]

const changedFrom = (
  plan: PublishPlan,
  nodes: NodeResults,
  edges: readonly PublishEdgeResult[],
): readonly string[] => [
  ...plan.nodes
    .filter((node) => nodeResult(nodes, node.key).action === "created")
    .map((node) => `node:${node.key}`),
  ...plan.edges.flatMap((edge, index) =>
    edges[index]?.action === "created" ? [`edge:${edge.to}:${edge.from}`] : [],
  ),
]

const failureResult = (
  plan: PublishPlan,
  nodes: NodeResults,
  edges: readonly PublishEdgeResult[],
  failed: FailedPublishAction,
  cause: unknown,
): PublishResult => ({
  action: "publish",
  status: "failed",
  changed: changedFrom(plan, nodes, edges),
  dryRun: false,
  snapshot: plan.snapshot,
  actions: actionsFrom(plan, nodes, edges),
  nodes: nodesInOrder(plan, nodes),
  edges,
  failed,
  cause,
})

const dryRunPublish = (plan: PublishPlan): PublishResult => ({
  action: "publish",
  status: plan.changed.length === 0 ? "skipped" : "updated",
  changed: plan.changed,
  dryRun: true,
  snapshot: plan.snapshot,
  actions: plan.actions,
  nodes: plan.nodes.map(initialNodeResult),
  edges: initialEdgeResults(plan),
})

const markBatchFailed = (
  nodes: NodeResults,
  batch: PublishPlan["batches"][number],
): MutableNodeResults => {
  const updated = new Map(nodes)
  for (const node of batch) {
    updated.set(node.key, { ...nodeResult(nodes, node.key), action: "failed" })
  }
  return updated
}

const batchTarget = (batch: PublishPlan["batches"][number]): string =>
  batch.map((node) => node.key).join(", ")

const executePublish = Effect.fn("IssuePublish.execute")(function* runPublish(
  client: LinearClientShape,
  plan: PublishPlan,
): Effect.fn.Return<PublishResult> {
  let nodes: MutableNodeResults = initialNodeResults(plan)
  const edges = initialEdgeResults(plan)
  for (const batch of plan.batches) {
    const outcome = yield* Effect.result(
      client.execute(
        issueBatchCreateMutation,
        { input: { issues: batch.map((node) => node.input) } },
        IssueBatchCreateResponse,
      ),
    )
    if (Result.isFailure(outcome)) {
      nodes = markBatchFailed(nodes, batch)
      return failureResult(
        plan,
        nodes,
        edges,
        {
          action: "create",
          target: batchTarget(batch),
          status: "failed",
          changes: { keys: batch.map((node) => node.key) },
        },
        outcome.failure,
      )
    }
    const payload = outcome.success.issueBatchCreate
    if (!payload.success) {
      nodes = markBatchFailed(nodes, batch)
      return failureResult(
        plan,
        nodes,
        edges,
        {
          action: "create",
          target: batchTarget(batch),
          status: "failed",
          changes: { keys: batch.map((node) => node.key) },
        },
        new TrackerError({
          code: "internal",
          message: "Linear did not create the issue batch.",
          hint: null,
        }),
      )
    }
    const byId = new Map(payload.issues.map((issue) => [String(issue.id), issue] as const))
    for (const node of batch) {
      const issue = byId.get(node.id)
      if (issue === undefined) {
        nodes = markBatchFailed(nodes, batch)
        return failureResult(
          plan,
          nodes,
          edges,
          {
            action: "create",
            target: batchTarget(batch),
            status: "failed",
            changes: { keys: batch.map((item) => item.key) },
          },
          new TrackerError({
            code: "internal",
            message: `The Linear batch response is missing the issue ${node.id}.`,
            hint: null,
          }),
        )
      }
      nodes.set(node.key, {
        ...nodeResult(nodes, node.key),
        id: String(issue.id),
        identifier: issue.identifier,
        action: "created",
      })
    }
  }
  for (let index = 0; index < plan.edges.length; index += 1) {
    const edge = plan.edges[index]
    const current = edges[index]
    if (edge === undefined || current === undefined) {
      continue
    }
    if (edge.action === "skip") {
      edges[index] = { ...current, action: "skipped" }
      continue
    }
    const outcome = yield* Effect.result(
      client.execute(
        createRelationMutation,
        { input: { issueId: edge.fromId, relatedIssueId: edge.toId, type: "blocks" } },
        CreateRelationResponse,
      ),
    )
    if (Result.isFailure(outcome) || !outcome.success.issueRelationCreate.success) {
      edges[index] = { ...current, action: "failed" }
      return failureResult(
        plan,
        nodes,
        edges,
        {
          action: "link",
          target: `${edge.to} <- ${edge.from}`,
          status: "failed",
          changes: { from: edge.from, to: edge.to, type: "blocks" },
        },
        Result.isFailure(outcome)
          ? outcome.failure
          : new TrackerError({
              code: "internal",
              message: "Linear did not create the blocking edge.",
              hint: null,
            }),
      )
    }
    edges[index] = { ...current, action: "created" }
  }
  const changed = changedFrom(plan, nodes, edges)
  return {
    action: "publish",
    status: changed.length === 0 ? "skipped" : "updated",
    changed,
    dryRun: false,
    snapshot: plan.snapshot,
    actions: actionsFrom(plan, nodes, edges),
    nodes: nodesInOrder(plan, nodes),
    edges,
  }
})

export { dryRunPublish, executePublish }
