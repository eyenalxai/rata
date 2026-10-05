import { isUuid } from "@/domain/ref"

const teamFilter = (value: string): Record<string, unknown> =>
  isUuid(value) ? { team: { id: { eq: value } } } : { team: { key: { eqIgnoreCase: value } } }

const projectFilter = (value: string): Record<string, unknown> =>
  isUuid(value)
    ? { project: { id: { eq: value } } }
    : { project: { name: { eqIgnoreCase: value } } }

const textFilter = (value: string): Record<string, unknown> => ({
  or: [{ title: { containsIgnoreCase: value } }, { description: { containsIgnoreCase: value } }],
})

const composeFilter = (
  parts: readonly Record<string, unknown>[],
): Record<string, unknown> | undefined => {
  if (parts.length === 0) {
    return undefined
  }
  if (parts.length === 1) {
    return parts[0]
  }
  return { and: parts }
}

export { composeFilter, projectFilter, teamFilter, textFilter }
