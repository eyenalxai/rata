import { describe, expect, test } from "bun:test"
import { Result } from "effect"

import { decodeStoredRepository } from "@/config/repo/decode"

type StoredRow = Parameters<typeof decodeStoredRepository>[0]

const row = (overrides: Record<string, unknown>): StoredRow => ({
  key: "/repo/.git",
  team: null,
  teamId: null,
  project: null,
  workspace: null,
  defaultAssignee: null,
  defaultLabels: null,
  defaultPriority: null,
  ...overrides,
})

const failureMessage = (value: StoredRow): string => {
  const result = decodeStoredRepository(value)
  if (Result.isSuccess(result)) {
    throw new Error("Expected the stored repository config to fail.")
  }
  return result.failure.message
}

describe("decodeStoredRepository", () => {
  test("names the workspace field when its type is wrong", () => {
    expect(failureMessage(row({ workspace: 42 }))).toBe(
      "The stored workspace of the repository config is not a string.",
    )
  })

  test("names the team id field when it is not a UUID", () => {
    expect(failureMessage(row({ teamId: "not-a-uuid" }))).toContain("team id")
    expect(failureMessage(row({ teamId: "not-a-uuid" }))).toContain("UUID")
  })

  test("names the default priority field when its value is invalid", () => {
    expect(failureMessage(row({ defaultPriority: 9 }))).toBe(
      "The stored default priority of the repository config is not valid.",
    )
  })

  test("names the default labels field when its JSON is invalid", () => {
    expect(failureMessage(row({ defaultLabels: "{" }))).toBe(
      "The stored default labels of the repository config are not valid JSON.",
    )
  })
})
