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
  const present = new Set(existing.map((name) => name.toLowerCase()))
  return {
    missing: canonicalLabels.filter((name) => !present.has(name.toLowerCase())),
    existing: canonicalLabels.filter((name) => present.has(name.toLowerCase())),
  }
}

const findLabelByName = <A extends { readonly name: string }>(
  labels: readonly A[],
  name: string,
): A | undefined => labels.find((label) => label.name.toLowerCase() === name.toLowerCase())

export { canonicalLabels, findLabelByName, planLabelEnsure, type CanonicalLabel, type LabelPlan }
