import { describe, expect, test } from "bun:test"
import { Result } from "effect"

import type { MissionState } from "@/domain/mission/state"

import { initState } from "@/domain/mission/init"
import {
  encodeMissionSection,
  encodeMissionState,
  readMissionSection,
} from "@/domain/mission/state"
import { parseTable, sessionPlanTable } from "@/domain/mission/table"

const state: MissionState = {
  schema: 1,
  status: "active",
  scope: "feature",
  phase: "implement",
  gate: { name: "PR", status: "pending", method: "code-review" },
  goal: "a mission-shaped front door",
  exit: "the tickets merged, 0.9.0 released",
  session: 6,
  next: {
    skill: "implement",
    gate: "PR",
    command: "implement the next ready ticket",
    produce: "one pull request",
  },
  gates: [
    {
      name: "Scope and understanding",
      status: "approved",
      method: "grill",
      evidence: "https://linear.app/example/issue/RAT-1",
      approvedAt: "2026-10-29T17:21:45.954Z",
    },
    { name: "Spec", status: "approved", method: "owner review" },
    { name: "Tickets", status: "rejected", method: "owner review", reason: "one edge missing" },
    { name: "PR", status: "pending", method: "code-review" },
  ],
}

const decodeBody = (body: string) => Result.getOrThrow(readMissionSection(body))

const parseResult = (content: string) => parseTable(content, sessionPlanTable)

describe("mission state codec", () => {
  test("round-trips every field through encode and decode", () => {
    const body = encodeMissionSection(state)
    expect(decodeBody(body)).toEqual({ _tag: "state", state })
  })

  test("writes the summary above the fence", () => {
    const body = encodeMissionSection(state)
    expect(body).toContain("Status: active")
    expect(body).toContain("Phase: implement")
    expect(body).toContain("Gate: PR, pending")
    expect(body).toContain("Session: 6")
    expect(body).toContain("```json")
  })

  test("treats a section without a json block as legacy", () => {
    expect(decodeBody("Status: active\n\nOld prose.")).toEqual({ _tag: "legacy" })
  })

  test("rejects a missing key", () => {
    const { session: _session, ...value } = state
    expect(readMissionSection(`\`\`\`json\n${JSON.stringify(value)}\n\`\`\``)).toMatchObject({
      _tag: "Failure",
    })
  })

  test("rejects an unknown key", () => {
    const value = { ...state, extra: true }
    expect(readMissionSection(`\`\`\`json\n${JSON.stringify(value)}\n\`\`\``)).toMatchObject({
      _tag: "Failure",
    })
  })

  test("rejects a newer schema version", () => {
    const value = { ...state, schema: 2 }
    expect(readMissionSection(`\`\`\`json\n${JSON.stringify(value)}\n\`\`\``)).toMatchObject({
      _tag: "Failure",
    })
  })

  test("rejects two json blocks", () => {
    const block = `\`\`\`json\n${encodeMissionState(state)}\n\`\`\``
    expect(readMissionSection(`${block}\n\n${block}`)).toMatchObject({ _tag: "Failure" })
  })

  test("rejects an unclosed fence", () => {
    expect(readMissionSection("```json\n{")).toMatchObject({ _tag: "Failure" })
  })
})

describe("mission init state", () => {
  test("starts from the defaults", () => {
    const fresh = Result.getOrThrow(initState(undefined, {}))
    expect(fresh).toMatchObject({
      schema: 1,
      status: "active",
      scope: "feature",
      phase: "classify",
      gate: { name: "Scope and understanding", status: "pending", method: "grill" },
      session: 1,
      next: { skill: "router", gate: "Scope and understanding" },
    })
    expect(fresh.gates.map((gate) => gate.name)).toEqual([
      "Scope and understanding",
      "Spec",
      "Tickets",
      "PR",
    ])
  })

  test("a reset keeps approvals and takes the target gate status", () => {
    const reset = Result.getOrThrow(initState(state, { gate: "Spec", phase: "spec" }))
    expect(reset.gate).toEqual({ name: "Spec", status: "approved", method: "owner review" })
    expect(reset.gates.find((gate) => gate.name === "Scope and understanding")?.evidence).toBe(
      "https://linear.app/example/issue/RAT-1",
    )
    expect(reset.next).toMatchObject({ skill: "to-spec", gate: "Spec" })
  })
})

describe("mission tables", () => {
  test("parses a valid table into rows", () => {
    const parsed = parseResult(
      "| Session | Work | Exit |\n| -- | -- | -- |\n| 1 | grill | approval |",
    )
    expect(Result.getOrThrow(parsed)).toEqual({
      columns: ["Session", "Work", "Exit"],
      rows: [{ Session: "1", Work: "grill", Exit: "approval" }],
    })
  })

  test("accepts a header with no rows", () => {
    const parsed = parseResult("| Session | Work | Exit |\n| -- | -- | -- |")
    expect(Result.getOrThrow(parsed).rows).toEqual([])
  })

  test("rejects a malformed row", () => {
    const parsed = parseResult("| Session | Work | Exit |\n| -- | -- | -- |\n| 1 | grill |")
    expect(parsed).toMatchObject({ _tag: "Failure" })
  })

  test("rejects the wrong columns", () => {
    const parsed = parseResult("| Session | Exit | Work |\n| -- | -- | -- |")
    expect(parsed).toMatchObject({ _tag: "Failure" })
  })

  test("rejects a missing separator", () => {
    const parsed = parseResult("| Session | Work | Exit |")
    expect(parsed).toMatchObject({ _tag: "Failure" })
  })
})
