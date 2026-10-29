import { Result } from "effect"

const labelColorPattern = /^#?[0-9a-f]{6}$/iu

const parseLabelColor = (value: string): Result.Result<string, string> => {
  if (!labelColorPattern.test(value)) {
    return Result.fail(`Expected a 6-digit hex color like #EB5757, got ${value}.`)
  }
  return Result.succeed(value.startsWith("#") ? value : `#${value}`)
}

const findLabelByName = <A extends { readonly name: string }>(
  labels: readonly A[],
  name: string,
): A | undefined => labels.find((label) => label.name.toLowerCase() === name.toLowerCase())

type LabelMode = "add" | "remove"

const labelChanges = <A extends { readonly id: string }>(
  wanted: readonly A[],
  present: ReadonlySet<string>,
  mode: LabelMode,
): readonly A[] => {
  const seen = new Set<string>()
  const changes: A[] = []
  for (const label of wanted) {
    if (seen.has(label.id)) {
      continue
    }
    seen.add(label.id)
    const has = present.has(label.id)
    if (mode === "add" && !has) {
      changes.push(label)
    }
    if (mode === "remove" && has) {
      changes.push(label)
    }
  }
  return changes
}

export { findLabelByName, labelChanges, type LabelMode, parseLabelColor }
