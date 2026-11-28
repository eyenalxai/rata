import type { Effect } from "effect"

import type { ResolvedContext } from "@/context/model"
import type { ContextResolver } from "@/context/resolve"
import type { TrackerError } from "@/domain/error"
import type { TeamId } from "@/domain/id"
import type { PlanStatus, PlanStep } from "@/domain/plan"
import type { PublishDocument, PublishKind } from "@/domain/publish"
import type { LinearClientShape } from "@/linear/client"
import type { LinearGatewayShape } from "@/linear/gateway"
import type { IssueSummary } from "@/tracker/model"
import type { IssueWriteApiError } from "@/tracker/write/model"
import type { makeIssueWriteResolvers } from "@/tracker/write/resolvers"

const publishBatchSize = 50

type PublishNodePlanBase = {
  readonly key: string
  readonly kind: PublishKind
  readonly title: string
  readonly id: string
  readonly parent: string | null
  readonly labels: readonly string[]
}

type PublishCreateNodePlan = PublishNodePlanBase & {
  readonly action: "create"
  readonly existing: null
  readonly input: Readonly<Record<string, unknown>>
}

type PublishReuseNodePlan = PublishNodePlanBase & {
  readonly action: "reuse"
  readonly existing: IssueSummary
  readonly input: null
}

type PublishNodePlan = PublishCreateNodePlan | PublishReuseNodePlan

type PublishEdgePlan = {
  readonly from: string
  readonly to: string
  readonly fromId: string
  readonly toId: string
  readonly action: "create" | "skip"
}

type PublishPlan = {
  readonly action: "publish"
  readonly teamId: TeamId
  readonly snapshot: string | null
  readonly order: readonly string[]
  readonly nodes: readonly PublishNodePlan[]
  readonly edges: readonly PublishEdgePlan[]
  readonly batches: readonly (readonly PublishCreateNodePlan[])[]
  readonly changed: readonly string[]
  readonly actions: readonly PlanStep[]
}

type PublishNodeResultAction = "create" | "reuse" | "created" | "reused" | "failed"

type PublishNodeResult = {
  readonly key: string
  readonly kind: PublishKind
  readonly title: string
  readonly id: string
  readonly identifier: string | null
  readonly parent: string | null
  readonly labels: readonly string[]
  readonly action: PublishNodeResultAction
}

type PublishEdgeResultAction = "create" | "skip" | "created" | "skipped" | "failed"

type PublishEdgeResult = {
  readonly from: string
  readonly to: string
  readonly action: PublishEdgeResultAction
}

type FailedPublishAction = {
  readonly action: "create" | "link"
  readonly target: string
  readonly status: "failed"
  readonly changes: Readonly<Record<string, unknown>>
}

type PublishResult = {
  readonly action: "publish"
  readonly status: "updated" | "skipped" | "failed"
  readonly changed: readonly string[]
  readonly dryRun: boolean
  readonly snapshot: string | null
  readonly actions: readonly PlanStep[]
  readonly nodes: readonly PublishNodeResult[]
  readonly edges: readonly PublishEdgeResult[]
  readonly failed?: FailedPublishAction | undefined
  readonly cause?: unknown
}

type PublishDependencies = {
  readonly client: LinearClientShape
  readonly gateway: LinearGatewayShape
  readonly contexts: ContextResolver["Service"]
  readonly resolvers: ReturnType<typeof makeIssueWriteResolvers>
}

type PublishPlanError = IssueWriteApiError | TrackerError

type IssuePublishShape = {
  readonly plan: (
    context: ResolvedContext,
    document: PublishDocument,
  ) => Effect.Effect<PublishPlan, PublishPlanError>
  readonly dryRun: (plan: PublishPlan) => PublishResult
  readonly execute: (plan: PublishPlan) => Effect.Effect<PublishResult>
}

const nodeStep = (node: PublishNodePlan, status: PlanStatus): PlanStep => ({
  action: "create",
  target: node.key,
  status,
  changes: {
    kind: node.kind,
    title: node.title,
    parent: node.parent,
    id: node.id,
  },
})

const edgeStep = (edge: PublishEdgePlan, status: PlanStatus): PlanStep => ({
  action: "link",
  target: `${edge.to} <- ${edge.from}`,
  status,
  changes: {
    from: edge.from,
    to: edge.to,
    type: "blocks",
  },
})

export {
  edgeStep,
  type FailedPublishAction,
  type IssuePublishShape,
  type PublishCreateNodePlan,
  type PublishDependencies,
  type PublishEdgePlan,
  type PublishEdgeResult,
  type PublishEdgeResultAction,
  type PublishNodePlan,
  type PublishNodePlanBase,
  type PublishNodeResult,
  type PublishNodeResultAction,
  type PublishPlan,
  type PublishPlanError,
  type PublishResult,
  type PublishReuseNodePlan,
  publishBatchSize,
  nodeStep,
}
