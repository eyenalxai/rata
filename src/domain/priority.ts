import { Result } from "effect"

const priorityByRank = [
  { token: "urgent", value: 1 },
  { token: "high", value: 2 },
  { token: "medium", value: 3 },
  { token: "low", value: 4 },
  { token: "none", value: 0 },
] as const

type Priority = (typeof priorityByRank)[number]["token"]
type PriorityValue = (typeof priorityByRank)[number]["value"]

const parsePriority = (value: string): Result.Result<PriorityValue, string> => {
  const normalized = value.toLowerCase()
  const match = priorityByRank.find(
    (entry) => entry.token === normalized || String(entry.value) === normalized,
  )
  return match === undefined
    ? Result.fail(`Expected none, urgent, high, medium, low, or 0-4, got ${value}.`)
    : Result.succeed(match.value)
}

const toPriority = (value: PriorityValue): Priority => {
  const match = priorityByRank.find((entry) => entry.value === value)
  if (match === undefined) {
    throw new Error(`Unknown priority value: ${String(value)}.`)
  }
  return match.token
}

const priorityRank = (priority: Priority): number =>
  priorityByRank.findIndex((entry) => entry.token === priority)

export { parsePriority, type Priority, priorityRank, type PriorityValue, toPriority }
