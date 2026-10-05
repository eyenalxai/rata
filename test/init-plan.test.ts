import { describe, expect, test } from "bun:test"
import { Option } from "effect"

import type { InitPlanInput } from "@/domain/init"

import { planInit } from "@/domain/init"

const input = (overrides: Partial<InitPlanInput>): InitPlanInput => ({
  force: false,
  config: { team: "RAT" },
  existingConfig: Option.none(),
  trackerDocument: "tracker",
  existingTrackerDocument: Option.none(),
  agentsDocument: "agents",
  existingAgents: Option.none(),
  ...overrides,
})

const actions = (overrides: Partial<InitPlanInput>) => {
  const plan = planInit(input(overrides))
  return [plan.config.action, plan.trackerDocument.action, plan.agents.action]
}

describe("planInit", () => {
  test("creates missing files", () => {
    expect(actions({})).toEqual(["create", "create", "create"])
  })

  test("keeps files that already hold the desired content", () => {
    expect(
      actions({
        existingConfig: Option.some({ team: "RAT" }),
        existingTrackerDocument: Option.some("tracker"),
        existingAgents: Option.some("agents"),
      }),
    ).toEqual(["unchanged", "unchanged", "unchanged"])
  })

  test("skips different files without force", () => {
    expect(
      actions({
        existingConfig: Option.some({ team: "OLD" }),
        existingTrackerDocument: Option.some("old tracker"),
        existingAgents: Option.some("old agents"),
      }),
    ).toEqual(["skip", "skip", "skip"])
  })

  test("overwrites different files with force", () => {
    expect(
      actions({
        force: true,
        existingConfig: Option.some({ team: "OLD" }),
        existingTrackerDocument: Option.some("old tracker"),
        existingAgents: Option.some("old agents"),
      }),
    ).toEqual(["overwrite", "overwrite", "overwrite"])
  })

  test("treats a config with the same fields as unchanged", () => {
    expect(
      actions({
        config: { team: "RAT", project: "rata" },
        existingConfig: Option.some({ project: "rata", team: "RAT" }),
      }),
    ).toEqual(["unchanged", "create", "create"])
  })

  test("treats a config with a different project as different", () => {
    expect(
      actions({
        config: { team: "RAT", project: "rata" },
        existingConfig: Option.some({ team: "RAT" }),
      }),
    ).toEqual(["skip", "create", "create"])
  })
})
