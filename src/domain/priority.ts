import { Result } from "effect"

const priorityTokens = ["urgent", "high", "medium", "low", "none"] as const
type Priority = (typeof priorityTokens)[number]

const priorityValues: Readonly<Record<string, number>> = {
  "0": 0,
  "1": 1,
  "2": 2,
  "3": 3,
  "4": 4,
  high: 2,
  low: 4,
  medium: 3,
  none: 0,
  urgent: 1,
}

const priorityByValue: Readonly<Record<number, Priority>> = {
  0: "none",
  1: "urgent",
  2: "high",
  3: "medium",
  4: "low",
}

const parsePriority = (value: string): Result.Result<number, string> => {
  const priority = priorityValues[value.toLowerCase()]
  return priority === undefined
    ? Result.fail(`Expected none, urgent, high, medium, low, or 0-4, got ${value}.`)
    : Result.succeed(priority)
}

const toPriority = (value: number): Priority => priorityByValue[value] ?? "none"

export { parsePriority, type Priority, priorityTokens, toPriority }
