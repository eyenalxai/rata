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
  test("judges each document against its own existing content", () => {
    expect(actions({ documents: documents({ tracker: "tracker", triage: "old triage" }) })).toEqual(
      ["create", "unchanged", "skip", "create", "create"],
    )
  })

  test("treats a config with the same fields as unchanged", () => {
    expect(
      actions({
        config: { team: "RAT", project: "rata", workspace: "work" },
        existingConfig: Option.some({ project: "rata", team: "RAT", workspace: "work" }),
      }),
    ).toEqual(["unchanged", "create", "create", "create", "create"])
  })

  test("treats a config with a different workspace as different", () => {
    expect(
      actions({
        config: { team: "RAT", workspace: "work" },
        existingConfig: Option.some({ team: "RAT", workspace: "personal" }),
      }),
    ).toEqual(["skip", "create", "create", "create", "create"])
  })
})
