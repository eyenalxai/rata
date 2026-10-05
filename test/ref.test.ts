import { describe, expect, test } from "bun:test"
import { Result } from "effect"

import { parseIssueRef } from "@/domain/ref"

const uuid = "5f0c1f2a-3b4c-4d5e-8f90-1234567890ab"

const expectRef = (input: string, expected: string) => {
  const parsed = parseIssueRef(input)
  expect(Result.isSuccess(parsed)).toBe(true)
  if (Result.isSuccess(parsed)) {
    expect(parsed.success).toBe(expected)
  }
}

const expectInvalid = (input: string) => {
  const parsed = parseIssueRef(input)
  expect(Result.isFailure(parsed)).toBe(true)
  if (Result.isFailure(parsed)) {
    expect(parsed.failure._tag).toBe("InvalidIssueRef")
    expect(parsed.failure.input).toBe(input)
  }
}

describe("parseIssueRef", () => {
  test("reads an identifier", () => {
    expectRef("RAT-42", "RAT-42")
  })

  test("uppercases a lowercase identifier", () => {
    expectRef("rat-42", "RAT-42")
  })

  test("reads a UUID", () => {
    expectRef(uuid, uuid)
  })

  test("reads an issue URL with a slug", () => {
    expectRef("https://linear.app/eyenalx/issue/RAT-42/some-slug", "RAT-42")
  })

  test("reads an issue URL without a slug", () => {
    expectRef("https://linear.app/eyenalx/issue/RAT-42", "RAT-42")
  })

  test("reads a UUID issue URL", () => {
    expectRef(`https://linear.app/eyenalx/issue/${uuid}`, uuid)
  })

  test("ignores a query string", () => {
    expectRef("https://linear.app/eyenalx/issue/RAT-42?foo=bar", "RAT-42")
  })

  test("rejects an empty string", () => {
    expectInvalid("")
  })

  test("rejects plain text", () => {
    expectInvalid("not-an-issue")
  })

  test("rejects an identifier without a number", () => {
    expectInvalid("RAT-")
  })

  test("rejects a URL on another host", () => {
    expectInvalid("https://example.com/eyenalx/issue/RAT-42")
  })

  test("rejects a linear.app URL without an issue segment", () => {
    expectInvalid("https://linear.app/eyenalx/team/RAT/settings")
  })
})
