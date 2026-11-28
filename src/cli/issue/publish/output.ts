import type { CommandOutput } from "@/cli/spec"
import type { PublishEdgeResult, PublishNodeResult, PublishResult } from "@/tracker/publish/model"

import { toTrackerError, exitCodeOf } from "@/cli/error-report"
import { arrayField, objectField, scalarField } from "@/cli/field/shape"
import { applyResultShape } from "@/cli/issue/write-output"

const publishNodeShape = objectField({
  key: scalarField,
  kind: scalarField,
  title: scalarField,
  id: scalarField,
  identifier: scalarField,
  parent: scalarField,
  labels: arrayField(scalarField),
  action: scalarField,
})

const publishEdgeShape = objectField({
  from: scalarField,
  to: scalarField,
  action: scalarField,
})

const publishShape = objectField({
  nodes: arrayField(publishNodeShape),
  edges: arrayField(publishEdgeShape),
  result: applyResultShape,
})

type PublicPublishError = {
  readonly code: string
  readonly message: string
  readonly hint: string | null
}

const publicResult = (result: PublishResult) => {
  const report = result.cause === undefined ? undefined : toTrackerError(result.cause)
  const error: PublicPublishError | undefined =
    report === undefined
      ? undefined
      : { code: report.code, message: report.message, hint: report.hint }
  return {
    action: result.action,
    status: result.status,
    changed: result.changed,
    dryRun: result.dryRun,
    snapshot: result.snapshot,
    actions: result.actions,
    ...(result.failed === undefined ? {} : { failed: result.failed }),
    ...(error === undefined ? {} : { error }),
  }
}

const nodeLine = (node: PublishNodeResult): string =>
  `  ${node.key}  ${node.identifier ?? "-"}  ${node.action}  ${node.title}`

const edgeLine = (edge: PublishEdgeResult): string => `  ${edge.from} -> ${edge.to}  ${edge.action}`

const resultLines = (result: PublishResult): readonly string[] => {
  const report = result.cause === undefined ? undefined : toTrackerError(result.cause)
  return [
    `result: ${result.status}${result.dryRun ? " (dry run)" : ""}`,
    `changed: ${result.changed.length === 0 ? "none" : result.changed.join(", ")}`,
    ...(result.failed === undefined || report === undefined
      ? []
      : [
          `failed: ${result.failed.action} ${result.failed.target}: ${report.code}: ${report.message}`,
        ]),
  ]
}

const publishOutput = (result: PublishResult): CommandOutput => {
  const report = result.cause === undefined ? undefined : toTrackerError(result.cause)
  return {
    kind: "resource",
    value: { nodes: result.nodes, edges: result.edges, result: publicResult(result) },
    text: [
      ...(result.nodes.length === 0 ? [] : ["nodes:", ...result.nodes.map(nodeLine)]),
      ...(result.edges.length === 0 ? [] : ["edges:", ...result.edges.map(edgeLine)]),
      "",
      ...resultLines(result),
    ],
    ...(report === undefined ? {} : { exitCode: exitCodeOf(report.code) }),
  }
}

export { publishOutput, publishShape }
