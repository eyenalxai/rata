import { describe, expect, test } from "bun:test"

import { canonicalLabels, planLabelEnsure } from "@/domain/labels"

describe("planLabelEnsure", () => {
  test("keeps existing labels in canonical order and ignores other labels", () => {
    const plan = planLabelEnsure(["wontfix", "unrelated", "needs-triage"])
    expect(plan.existing).toEqual(["needs-triage", "wontfix"])
    expect(plan.missing).toEqual(
      canonicalLabels.filter((name) => name !== "needs-triage" && name !== "wontfix"),
    )
  })

  test("matches existing names case-insensitively and keeps canonical order", () => {
    const plan = planLabelEnsure(["Bug", "NEEDS-TRIAGE"])
    expect(plan.existing).toEqual(["needs-triage", "bug"])
    expect(plan.missing).toEqual(
      canonicalLabels.filter((name) => name !== "needs-triage" && name !== "bug"),
    )
  })
})
