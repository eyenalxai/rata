import { Result } from "effect"

const priorities: Readonly<Record<string, number>> = {
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

const parsePriority = (value: string): Result.Result<number, string> => {
  const priority = priorities[value.toLowerCase()]
  return priority === undefined
    ? Result.fail(`Expected none, urgent, high, medium, low, or 0-4, got ${value}.`)
    : Result.succeed(priority)
}

export { parsePriority }
