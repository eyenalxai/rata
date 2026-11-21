import { Result, Schema, SchemaGetter } from "effect"

const priorities = ["urgent", "high", "medium", "low", "none"] as const
type Priority = (typeof priorities)[number]

const priorityValues = [0, 1, 2, 3, 4] as const
type PriorityValue = (typeof priorityValues)[number]

const PrioritySchema = Schema.Literals(priorities)
const PriorityValueSchema = Schema.Literals(priorityValues)

const priorityByValue: Readonly<Record<PriorityValue, Priority>> = {
  0: "none",
  1: "urgent",
  2: "high",
  3: "medium",
  4: "low",
}

const valueByPriority: Readonly<Record<Priority, PriorityValue>> = {
  none: 0,
  urgent: 1,
  high: 2,
  medium: 3,
  low: 4,
}

const rankByPriority: Readonly<Record<Priority, number>> = {
  urgent: 0,
  high: 1,
  medium: 2,
  low: 3,
  none: 4,
}

const priorityFromValue = (value: PriorityValue): Priority => priorityByValue[value]

const priorityValue = (priority: Priority): PriorityValue => valueByPriority[priority]

const priorityRank = (priority: Priority): number => rankByPriority[priority]

const isPriority = (value: string): value is Priority =>
  priorities.some((priority) => priority === value.toLowerCase())

const isPriorityValue = (value: number): value is PriorityValue =>
  priorityValues.some((candidate) => candidate === value)

const parsePriority = (value: string): Result.Result<Priority, string> => {
  const normalized = value.toLowerCase()
  if (isPriority(normalized)) {
    return Result.succeed(normalized)
  }
  const numeric = Number(normalized)
  if (isPriorityValue(numeric)) {
    return Result.succeed(priorityFromValue(numeric))
  }
  return Result.fail(`Expected none, urgent, high, medium, low, or 0-4, got ${value}.`)
}

const PriorityFromValue = PriorityValueSchema.pipe(
  Schema.decodeTo(PrioritySchema, {
    decode: SchemaGetter.transform(priorityFromValue),
    encode: SchemaGetter.transform(priorityValue),
  }),
)

const storedPriority = (priority: Priority): number | null =>
  priority === "none" ? null : priorityValue(priority)

const priorityFromStored = (value: number | null | undefined): Priority | null =>
  value === null || value === undefined || value === 0
    ? null
    : isPriorityValue(value)
      ? priorityFromValue(value)
      : null

export {
  isPriority,
  isPriorityValue,
  parsePriority,
  type Priority,
  priorityFromStored,
  priorityFromValue,
  priorityRank,
  priorities,
  PriorityFromValue,
  PrioritySchema,
  type PriorityValue,
  priorityValue,
  priorityValues,
  PriorityValueSchema,
  storedPriority,
}
