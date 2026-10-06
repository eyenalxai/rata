const findLabelByName = <A extends { readonly name: string }>(
  labels: readonly A[],
  name: string,
): A | undefined => labels.find((label) => label.name.toLowerCase() === name.toLowerCase())

export { findLabelByName }
