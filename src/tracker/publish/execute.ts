import { Effect, Result } from "effect"

import type { LinearClientShape } from "@/linear/client"
import type { MutableNodeResults } from "@/tracker/publish/execute/results"
import type { PublishPlan, PublishResult } from "@/tracker/publish/model"

import { TrackerError } from "@/domain/error"
import { CreateRelationResponse, IssueBatchCreateResponse } from "@/linear/decode/issue"
import { issueBatchCreateMutation } from "@/tracker/publish/documents"
import {
  actionsFrom,
  batchKeys,
  changedFrom,
  changedReuseWarning,
  failureResult,
  initialEdgeResults,
  initialNodeResults,
  markBatchFailed,
  nodeResult,
  nodesInOrder,
} from "@/tracker/publish/execute/results"
import { createRelationMutation } from "@/tracker/write/documents"

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
        priority: issue.priority,
        state: issue.state.name,
        assignee: issue.assignee?.id ?? null,
        labels: issue.labels.nodes.map((label) => label.name),
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
    order: plan.order,
    batches: batchKeys(plan),
    actions: actionsFrom(plan, nodes, edges),
    nodes: nodesInOrder(plan, nodes),
    edges,
    warning: changedReuseWarning(plan),
  }
})

export { executePublish }
