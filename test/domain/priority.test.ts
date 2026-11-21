import { describe, expect, test } from "bun:test"
import { Effect, Result, Schema } from "effect"

import type { ProjectId } from "@/domain/id"

import { projectId, teamId } from "@/domain/id"
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
  test("parses the token and numeric boundary forms to one value", () => {
    expect(Result.getOrThrow(parsePriority("urgent"))).toBe("urgent")
    expect(Result.getOrThrow(parsePriority("HIGH"))).toBe("high")
    expect(Result.getOrThrow(parsePriority("0"))).toBe("none")
    expect(Result.getOrThrow(parsePriority("3"))).toBe("medium")
    expect(Result.isFailure(parsePriority("5"))).toBe(true)
    expect(Result.isFailure(parsePriority("severity"))).toBe(true)
  })

  test("maps the wire value and the stored value at their boundaries", () => {
    expect(priorityFromValue(0)).toBe("none")
    expect(priorityFromValue(4)).toBe("low")
    expect(priorityValue("high")).toBe(2)
    expect(storedPriority("none")).toBeNull()
    expect(storedPriority("urgent")).toBe(1)
    expect(priorityFromStored(null)).toBeNull()
    expect(priorityFromStored(0)).toBeNull()
    expect(priorityFromStored(3)).toBe("medium")
    expect(priorityFromStored(9)).toBeNull()
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
    expect(String(project)).toBe(String(team))
  })

  test("constructs a project id with its own brand", () => {
    const project = projectId("project-1")
    expect(String(project)).toBe("project-1")
  })
})
