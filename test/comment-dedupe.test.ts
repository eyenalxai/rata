import { describe, expect, test } from "bun:test"

import { dedupeCommentId } from "@/domain/comment"

const uuidV4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u

describe("dedupeCommentId", () => {
  test("is stable for one issue and key", () => {
    expect(dedupeCommentId("i1", "handoff")).toBe(dedupeCommentId("i1", "handoff"))
  })

  test("matches the sha256 vector with the version and variant bits set", () => {
    expect(dedupeCommentId("i1", "k")).toBe("89835727-7197-4c5a-bd2f-9d2c7c3db8f5")
  })

  test("is a UUIDv4", () => {
    expect(dedupeCommentId("i1", "handoff")).toMatch(uuidV4)
    expect(dedupeCommentId("i2", "handoff")).toMatch(uuidV4)
  })

  test("changes with the issue and with the key", () => {
    const base = dedupeCommentId("i1", "handoff")
    expect(dedupeCommentId("i2", "handoff")).not.toBe(base)
    expect(dedupeCommentId("i1", "other")).not.toBe(base)
  })
})
