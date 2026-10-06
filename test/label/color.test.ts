import { describe, expect, test } from "bun:test"
import { Result } from "effect"

import { parseLabelColor } from "@/domain/labels"

const colorOf = (value: string): string => {
  const parsed = parseLabelColor(value)
  if (Result.isFailure(parsed)) {
    throw new Error(`Expected ${value} to parse.`)
  }
  return parsed.success
}

const failureOf = (value: string): string => {
  const parsed = parseLabelColor(value)
  if (Result.isSuccess(parsed)) {
    throw new Error(`Expected ${value} to fail.`)
  }
  return parsed.failure
}

describe("parseLabelColor", () => {
  test("adds the hash to a bare hex value", () => {
    expect(colorOf("EB5757")).toBe("#EB5757")
  })

  test("keeps the hash and the case", () => {
    expect(colorOf("#eb5757")).toBe("#eb5757")
  })

  test("rejects short, long, and non-hex values", () => {
    expect(failureOf("#abc")).toContain("#abc")
    expect(failureOf("red")).toContain("red")
    expect(failureOf("#12345g")).toContain("#12345g")
    expect(failureOf("")).toBeDefined()
  })
})
