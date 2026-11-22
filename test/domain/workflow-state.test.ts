import { describe, expect, test } from "bun:test"

import type { StateType, WorkflowStateNode } from "@/domain/workflow-state"

import { workflowStateId } from "@/domain/id"
import {
  closedStateTypes,
  isClosedState,
  stateByName,
  stateByType,
  stateTypes,
} from "@/domain/workflow-state"

const states: readonly WorkflowStateNode[] = [
  { id: workflowStateId("s1"), name: "Todo", type: "unstarted" },
  { id: workflowStateId("s2"), name: "Done", type: "completed" },
]

describe("workflow state", () => {
  test("keeps the state type a literal union", () => {
    // @ts-expect-error done is not a Linear state type
    const invalid: StateType = "done"
    expect(stateTypes).not.toContain(invalid)
  })

  test("treats terminal states as closed", () => {
    expect(closedStateTypes).toEqual(["completed", "canceled", "duplicate"])
    for (const type of closedStateTypes) {
      expect(isClosedState(type)).toBe(true)
    }
    expect(isClosedState("started")).toBe(false)
    expect(isClosedState("triage")).toBe(false)
  })

  test("finds a state by name and by type", () => {
    expect(String(stateByName(states, "done")?.id)).toBe("s2")
    expect(stateByType(states, "unstarted")?.name).toBe("Todo")
    expect(stateByName(states, "missing")).toBeUndefined()
  })
})
