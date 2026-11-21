import { describe, expect, test } from "bun:test"
import { Effect, Result, Schema } from "effect"

import type { ProjectId } from "@/domain/id"

import { teamId } from "@/domain/id"
import {
  parsePriority,
  priorityFromStored,
  priorityFromValue,
  priorityRank,
  PriorityFromValue,
  priorityValue,
  storedPriority,
} from "@/domain/priority"

describe("priority", () => {
  test("parses the five tokens in either case", () => {
    expect(Result.getOrThrow(parsePriority("urgent"))).toBe("urgent")
    expect(Result.getOrThrow(parsePriority("HIGH"))).toBe("high")
    expect(Result.getOrThrow(parsePriority("Medium"))).toBe("medium")
    expect(Result.getOrThrow(parsePriority("low"))).toBe("low")
    expect(Result.getOrThrow(parsePriority("none"))).toBe("none")
  })

  test("parses only the canonical numeric strings", () => {
    expect(Result.getOrThrow(parsePriority("0"))).toBe("none")
    expect(Result.getOrThrow(parsePriority("1"))).toBe("urgent")
    expect(Result.getOrThrow(parsePriority("2"))).toBe("high")
    expect(Result.getOrThrow(parsePriority("3"))).toBe("medium")
    expect(Result.getOrThrow(parsePriority("4"))).toBe("low")
  })

  test("rejects malformed numeric forms", () => {
    for (const value of ["", " ", "0x2", "2.0", "2e0", " 3 ", "-0", "5", "10"]) {
      expect(Result.isFailure(parsePriority(value))).toBe(true)
    }
  })

  test("maps the wire value and the stored value at their boundaries", () => {
    expect(priorityFromValue(0)).toBe("none")
    expect(priorityFromValue(4)).toBe("low")
    expect(priorityValue("high")).toBe(2)
    expect(storedPriority("none")).toBeNull()
    expect(storedPriority("urgent")).toBe(1)
    expect(Result.getOrThrow(priorityFromStored(null))).toBeNull()
    expect(Result.getOrThrow(priorityFromStored(0))).toBeNull()
    expect(Result.getOrThrow(priorityFromStored(3))).toBe("medium")
    expect(Result.isFailure(priorityFromStored(9))).toBe(true)
  })

  test("ranks urgent first and none last", () => {
    expect(
      (["none", "low", "medium", "high", "urgent"] as const)
        .toSorted((left, right) => priorityRank(left) - priorityRank(right))
        .map(priorityRank),
    ).toEqual([0, 1, 2, 3, 4])
  })

  test("decodes one priority form from the Linear number", async () => {
    expect(await Effect.runPromise(Schema.decodeEffect(PriorityFromValue)(2))).toBe("high")
    expect(await Effect.runPromise(Schema.encodeEffect(PriorityFromValue)("high"))).toBe(2)
  })
})

describe("branded ids", () => {
  test("a team id cannot stand in for a project id", () => {
    const team = teamId("team-1")
    // @ts-expect-error a TeamId is not a ProjectId
    const project: ProjectId = team
    void project
  })
})
