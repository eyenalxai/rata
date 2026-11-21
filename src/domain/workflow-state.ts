import { Schema } from "effect"

import { WorkflowStateId } from "@/domain/id"

const stateTypes = ["triage", "backlog", "unstarted", "started", "completed", "canceled"] as const
type StateType = (typeof stateTypes)[number]

const StateTypeSchema = Schema.Literals(stateTypes)

const closedStateTypes: readonly StateType[] = ["completed", "canceled"]

const WorkflowState = Schema.Struct({
  name: Schema.String,
  type: StateTypeSchema,
})
type WorkflowState = typeof WorkflowState.Type

const WorkflowStateNode = Schema.Struct({
  id: WorkflowStateId,
  name: Schema.String,
  type: StateTypeSchema,
})
type WorkflowStateNode = typeof WorkflowStateNode.Type

const isClosedState = (type: StateType): boolean =>
  closedStateTypes.some((closed) => closed === type)

const stateByName = (
  states: readonly WorkflowStateNode[],
  name: string,
): WorkflowStateNode | undefined =>
  states.find((state) => state.name.toLowerCase() === name.toLowerCase())

const stateByType = (
  states: readonly WorkflowStateNode[],
  type: StateType,
): WorkflowStateNode | undefined => states.find((state) => state.type === type)

export {
  closedStateTypes,
  isClosedState,
  type StateType,
  stateByName,
  stateByType,
  stateTypes,
  StateTypeSchema,
  WorkflowState,
  WorkflowStateNode,
}
