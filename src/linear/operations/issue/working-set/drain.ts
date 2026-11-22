import { Effect } from "effect"

import type { IssueId } from "@/domain/id"
import type { Connection } from "@/linear/connection"
import type {
  IssueAttachment,
  IssueComment,
  IssueInverseRelation,
  IssueLabel,
  IssueRelation,
} from "@/linear/decode/issue"
import type {
  IssueFullWorkingNode,
  IssueWorkingChildFullNode,
  IssueWorkingChildNode,
  IssueWorkingNode,
  WorkingSummaryNode,
} from "@/linear/decode/issue/working-set"
import type { LinearApiError } from "@/linear/errors"
import type { WorkingSetFetchers } from "@/linear/operations/issue/working-set/fetch"

import { lastPageInfo } from "@/linear/connection"
import { workingLimits } from "@/linear/documents/issue/fields"
import {
  drainNodeConnection,
  malformedPayload,
  rebuildChildren,
} from "@/linear/operations/issue/working-set/pages"

const makeWorkingSetDrains = (fetchers: WorkingSetFetchers) => {
  const drainChildConnections = <
    Node extends { readonly children: Connection<Child> },
    Child extends {
      readonly id: IssueId
      readonly inverseRelations: Connection<IssueInverseRelation>
    },
  >(
    nodes: readonly Node[],
  ): Effect.Effect<readonly Node[], LinearApiError> =>
    Effect.gen(function* drainWorkingChildren() {
      const children = nodes.flatMap((node) => node.children.nodes)
      const inverseRelations = yield* drainNodeConnection<Child, IssueInverseRelation>({
        nodes: children,
        idOf: (child) => child.id,
        connectionOf: (child) => child.inverseRelations,
        update: (child, items) => ({
          ...child,
          inverseRelations: { nodes: items, pageInfo: lastPageInfo },
        }),
        fetchPage: fetchers.inverseRelations(workingLimits.childRelations),
      })
      return yield* rebuildChildren(nodes, inverseRelations)
    })

  const drainComments = <
    Node extends {
      readonly id: IssueId
      readonly comments?: Connection<IssueComment> | undefined
    },
  >(
    nodes: readonly Node[],
  ): Effect.Effect<readonly Node[], LinearApiError> => {
    const required: (Node & { readonly comments: Connection<IssueComment> })[] = []
    for (const node of nodes) {
      if (node.comments === undefined) {
        return Effect.fail(malformedPayload())
      }
      required.push({ ...node, comments: node.comments })
    }
    return drainNodeConnection<
      Node & { readonly comments: Connection<IssueComment> },
      IssueComment
    >({
      nodes: required,
      idOf: (node) => node.id,
      connectionOf: (node) => node.comments,
      update: (node, items) => ({
        ...node,
        comments: { nodes: items, pageInfo: lastPageInfo },
      }),
      fetchPage: fetchers.comments,
    })
  }

  const drainSummaryNodes = (nodes: readonly WorkingSummaryNode[]) =>
    drainNodeConnection<WorkingSummaryNode, IssueLabel>({
      nodes,
      idOf: (node) => node.id,
      connectionOf: (node) => node.labels,
      update: (node, labels) => ({ ...node, labels: { nodes: labels, pageInfo: lastPageInfo } }),
      fetchPage: fetchers.labels(workingLimits.labels),
    })

  const drainWorkingNodes = (nodes: readonly IssueWorkingNode[], comments: boolean) =>
    Effect.gen(function* drainWorkingSetNodes() {
      const withLabels = yield* drainNodeConnection<IssueWorkingNode, IssueLabel>({
        nodes,
        idOf: (node) => node.id,
        connectionOf: (node) => node.labels,
        update: (node, items) => ({ ...node, labels: { nodes: items, pageInfo: lastPageInfo } }),
        fetchPage: fetchers.labels(workingLimits.labels),
      })
      const withRelations = yield* drainNodeConnection<IssueWorkingNode, IssueRelation>({
        nodes: withLabels,
        idOf: (node) => node.id,
        connectionOf: (node) => node.relations,
        update: (node, items) => ({ ...node, relations: { nodes: items, pageInfo: lastPageInfo } }),
        fetchPage: fetchers.relations,
      })
      const withInverse = yield* drainNodeConnection<IssueWorkingNode, IssueInverseRelation>({
        nodes: withRelations,
        idOf: (node) => node.id,
        connectionOf: (node) => node.inverseRelations,
        update: (node, items) => ({
          ...node,
          inverseRelations: { nodes: items, pageInfo: lastPageInfo },
        }),
        fetchPage: fetchers.inverseRelations(workingLimits.relations),
      })
      const withChildren = yield* drainNodeConnection<IssueWorkingNode, IssueWorkingChildNode>({
        nodes: withInverse,
        idOf: (node) => node.id,
        connectionOf: (node) => node.children,
        update: (node, items) => ({ ...node, children: { nodes: items, pageInfo: lastPageInfo } }),
        fetchPage: fetchers.children,
      })
      const withAttachments = yield* drainNodeConnection<IssueWorkingNode, IssueAttachment>({
        nodes: withChildren,
        idOf: (node) => node.id,
        connectionOf: (node) => node.attachments,
        update: (node, items) => ({
          ...node,
          attachments: { nodes: items, pageInfo: lastPageInfo },
        }),
        fetchPage: fetchers.attachments,
      })
      const withChildConnections = yield* drainChildConnections(withAttachments)
      return comments ? yield* drainComments(withChildConnections) : withChildConnections
    })

  const drainFullWorkingNodes = (nodes: readonly IssueFullWorkingNode[], comments: boolean) =>
    Effect.gen(function* drainFullWorkingSetNodes() {
      const withLabels = yield* drainNodeConnection<IssueFullWorkingNode, IssueLabel>({
        nodes,
        idOf: (node) => node.id,
        connectionOf: (node) => node.labels,
        update: (node, items) => ({ ...node, labels: { nodes: items, pageInfo: lastPageInfo } }),
        fetchPage: fetchers.labels(workingLimits.labels),
      })
      const withRelations = yield* drainNodeConnection<IssueFullWorkingNode, IssueRelation>({
        nodes: withLabels,
        idOf: (node) => node.id,
        connectionOf: (node) => node.relations,
        update: (node, items) => ({ ...node, relations: { nodes: items, pageInfo: lastPageInfo } }),
        fetchPage: fetchers.relations,
      })
      const withInverse = yield* drainNodeConnection<IssueFullWorkingNode, IssueInverseRelation>({
        nodes: withRelations,
        idOf: (node) => node.id,
        connectionOf: (node) => node.inverseRelations,
        update: (node, items) => ({
          ...node,
          inverseRelations: { nodes: items, pageInfo: lastPageInfo },
        }),
        fetchPage: fetchers.inverseRelations(workingLimits.relations),
      })
      const withChildren = yield* drainNodeConnection<
        IssueFullWorkingNode,
        IssueWorkingChildFullNode
      >({
        nodes: withInverse,
        idOf: (node) => node.id,
        connectionOf: (node) => node.children,
        update: (node, items) => ({ ...node, children: { nodes: items, pageInfo: lastPageInfo } }),
        fetchPage: fetchers.fullChildren,
      })
      const withAttachments = yield* drainNodeConnection<IssueFullWorkingNode, IssueAttachment>({
        nodes: withChildren,
        idOf: (node) => node.id,
        connectionOf: (node) => node.attachments,
        update: (node, items) => ({
          ...node,
          attachments: { nodes: items, pageInfo: lastPageInfo },
        }),
        fetchPage: fetchers.attachments,
      })
      const withChildConnections = yield* drainChildConnections(withAttachments)
      const withChildLabels = yield* drainNodeConnection<IssueWorkingChildFullNode, IssueLabel>({
        nodes: withChildConnections.flatMap((node) => node.children.nodes),
        idOf: (child) => child.id,
        connectionOf: (child) => child.labels,
        update: (child, items) => ({
          ...child,
          labels: { nodes: items, pageInfo: lastPageInfo },
        }),
        fetchPage: fetchers.labels(workingLimits.childLabels),
      })
      const withFullChildren = yield* rebuildChildren(withChildConnections, withChildLabels)
      return comments ? yield* drainComments(withFullChildren) : withFullChildren
    })

  return { drainFullWorkingNodes, drainSummaryNodes, drainWorkingNodes }
}

type WorkingSetDrains = ReturnType<typeof makeWorkingSetDrains>

export { makeWorkingSetDrains, type WorkingSetDrains }
