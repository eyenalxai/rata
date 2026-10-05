import { describe, expect, test } from "bun:test"

import { canonicalLabels, planLabelEnsure } from "@/domain/labels"

describe("planLabelEnsure", () => {
  test("plans every canonical label when none exist", () => {
    const plan = planLabelEnsure([])
    expect(plan.missing).toEqual([...canonicalLabels])
    expect(plan.existing).toEqual([])
  })

  test("keeps existing labels in canonical order and ignores other labels", () => {
    const plan = planLabelEnsure(["wontfix", "unrelated", "needs-triage"])
    expect(plan.existing).toEqual(["needs-triage", "wontfix"])
    expect(plan.missing).toEqual(
      canonicalLabels.filter((name) => name !== "needs-triage" && name !== "wontfix"),
    )
  })

  test("plans nothing when every canonical label exists", () => {
    const plan = planLabelEnsure([...canonicalLabels, "extra"])
    expect(plan.missing).toEqual([])
    expect(plan.existing).toEqual([...canonicalLabels])
  })
})
