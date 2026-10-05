import { describe, expect, test } from "bun:test"
import { Option } from "effect"

import type { InitDocument, InitPlanInput } from "@/domain/init"

import { planInit } from "@/domain/init"

const document = (path: string, content: string, existing?: string): InitDocument => ({
  path,
  content,
  existing: Option.fromUndefinedOr(existing),
})

const documents = (
  existing: {
    readonly tracker?: string
    readonly triage?: string
    readonly domain?: string
  } = {},
): readonly InitDocument[] => [
  document("docs/agents/issue-tracker.md", "tracker", existing.tracker),
  document("docs/agents/triage-labels.md", "triage", existing.triage),
  document("docs/agents/domain.md", "domain", existing.domain),
]

const input = (overrides: Partial<InitPlanInput>): InitPlanInput => ({
  force: false,
  config: { team: "RAT" },
  existingConfig: Option.none(),
  documents: documents(),
  agentsDocument: "agents",
  existingAgents: Option.none(),
  ...overrides,
})

const actions = (overrides: Partial<InitPlanInput>) => {
  const plan = planInit(input(overrides))
  return [plan.config.action, ...plan.documents.map((step) => step.action), plan.agents.action]
}

describe("planInit", () => {
  test("creates missing files", () => {
    expect(actions({})).toEqual(["create", "create", "create", "create", "create"])
  })

  test("keeps files that already hold the desired content", () => {
    expect(
      actions({
        existingConfig: Option.some({ team: "RAT" }),
        documents: documents({ tracker: "tracker", triage: "triage", domain: "domain" }),
        existingAgents: Option.some("agents"),
      }),
    ).toEqual(["unchanged", "unchanged", "unchanged", "unchanged", "unchanged"])
  })

  test("skips different files without force", () => {
    expect(
      actions({
        existingConfig: Option.some({ team: "OLD" }),
        documents: documents({
          tracker: "old tracker",
          triage: "old triage",
          domain: "old domain",
        }),
        existingAgents: Option.some("old agents"),
      }),
    ).toEqual(["skip", "skip", "skip", "skip", "skip"])
  })

  test("overwrites different files with force", () => {
    expect(
      actions({
        force: true,
        existingConfig: Option.some({ team: "OLD" }),
        documents: documents({
          tracker: "old tracker",
          triage: "old triage",
          domain: "old domain",
        }),
        existingAgents: Option.some("old agents"),
      }),
    ).toEqual(["overwrite", "overwrite", "overwrite", "overwrite", "overwrite"])
  })

  test("judges each document against its own existing content", () => {
    expect(actions({ documents: documents({ tracker: "tracker", triage: "old triage" }) })).toEqual(
      ["create", "unchanged", "skip", "create", "create"],
    )
  })

  test("treats a config with the same fields as unchanged", () => {
    expect(
      actions({
        config: { team: "RAT", project: "rata" },
        existingConfig: Option.some({ project: "rata", team: "RAT" }),
      }),
    ).toEqual(["unchanged", "create", "create", "create", "create"])
  })

  test("treats a config with a different project as different", () => {
    expect(
      actions({
        config: { team: "RAT", project: "rata" },
        existingConfig: Option.some({ team: "RAT" }),
      }),
    ).toEqual(["skip", "create", "create", "create", "create"])
  })
})
