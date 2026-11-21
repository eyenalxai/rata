import { describe, expect, test } from "bun:test"
import { Effect, Option } from "effect"

import type { Priority } from "@/domain/priority"

import { resolvePriority } from "@/cli/priority"

const rejected = ["", " ", "0x2", "2.0", "2e0", " 3 ", "-0", "5"]

const accepted: readonly (readonly [string, Priority])[] = [
  ["0", "none"],
  ["4", "low"],
  ["high", "high"],
  ["NONE", "none"],
]

describe("the priority flag boundary", () => {
  test("rejects malformed numeric forms with a validation error", async () => {
    const errors = await Promise.all(
      rejected.map((value) => Effect.runPromise(Effect.flip(resolvePriority(Option.some(value))))),
    )
    for (const error of errors) {
      expect(error._tag).toBe("PriorityInputError")
    }
  })

  test("accepts the canonical numeric strings and tokens", async () => {
    const priorities = await Promise.all(
      accepted.map(async ([value, expected]) => ({
        priority: await Effect.runPromise(resolvePriority(Option.some(value))),
        expected,
      })),
    )
    for (const { priority, expected } of priorities) {
      expect(priority).toEqual(Option.some(expected))
    }
  })
})
