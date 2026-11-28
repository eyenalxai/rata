import type { PlanStatus } from "@/domain/plan"
import type {
  FailedPublishAction,
  PublishEdgeResult,
  PublishNodeResult,
  PublishPlan,
  PublishResult,
  PublishReuseNodePlan,
} from "@/tracker/publish/model"

import { edgeStep, nodeStep } from "@/tracker/publish/model"

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
  priority: node.priority,
  state: node.state,
  assignee: node.assignee,
  body: node.body,
  changed: node.changed,
  changes: node.changes,
  action: node.action,
})

const batchKeys = (plan: PublishPlan): readonly (readonly string[])[] =>
  plan.batches.map((batch) => batch.map((node) => node.key))

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

const changedReuse = (plan: PublishPlan): readonly PublishReuseNodePlan[] =>
  plan.nodes.filter((node): node is PublishReuseNodePlan => node.action === "reuse" && node.changed)

const changedReuseWarning = (plan: PublishPlan): string | null => {
  const nodes = changedReuse(plan)
  if (nodes.length === 0) {
    return null
  }
  const subject = nodes.length === 1 ? "node" : "nodes"
  const verb = nodes.length === 1 ? "differs" : "differ"
  const list = nodes.map((node) => `${node.key} (${node.changes.join(", ")})`).join(", ")
  return `The reused ${subject} ${list} ${verb} from the document. The stored values are kept. Use a new key to publish a changed node, or run \`rata issue apply\` to change the issue.`
}

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
  order: plan.order,
  batches: batchKeys(plan),
  actions: actionsFrom(plan, nodes, edges),
  nodes: nodesInOrder(plan, nodes),
  edges,
  warning: changedReuseWarning(plan),
  failed,
  cause,
})

const dryRunPublish = (plan: PublishPlan): PublishResult => ({
  action: "publish",
  status: plan.changed.length === 0 ? "skipped" : "updated",
  changed: plan.changed,
  dryRun: true,
  snapshot: plan.snapshot,
  order: plan.order,
  batches: batchKeys(plan),
  actions: plan.actions,
  nodes: plan.nodes.map(initialNodeResult),
  edges: initialEdgeResults(plan),
  warning: changedReuseWarning(plan),
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

export {
  actionsFrom,
  batchKeys,
  changedFrom,
  changedReuseWarning,
  dryRunPublish,
  failureResult,
  initialEdgeResults,
  initialNodeResults,
  type MutableNodeResults,
  markBatchFailed,
  nodeResult,
  nodesInOrder,
}
