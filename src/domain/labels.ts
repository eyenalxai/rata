const canonicalLabels = [
  "needs-triage",
  "needs-info",
  "ready-for-agent",
  "ready-for-human",
  "wontfix",
  "bug",
  "enhancement",
  "wayfinder:map",
  "wayfinder:research",
  "wayfinder:prototype",
  "wayfinder:grilling",
  "wayfinder:task",
] as const

type CanonicalLabel = (typeof canonicalLabels)[number]

type LabelPlan = {
  readonly missing: readonly CanonicalLabel[]
  readonly existing: readonly CanonicalLabel[]
}

const planLabelEnsure = (existing: readonly string[]): LabelPlan => {
  const present = new Set(existing)
  return {
    missing: canonicalLabels.filter((name) => !present.has(name)),
    existing: canonicalLabels.filter((name) => present.has(name)),
  }
}

export { canonicalLabels, planLabelEnsure, type CanonicalLabel, type LabelPlan }
