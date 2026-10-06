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

export { findLabelByName, parseLabelColor }
