import { describe, expect, test } from "bun:test"
import { Result } from "effect"

import type { PublishNode } from "@/domain/publish"

import { TrackerError } from "@/domain/error"
import { publishOrder, publishUuid } from "@/domain/publish"

const node = (key: string, extra: Partial<PublishNode> = {}): PublishNode => ({
  key,
  kind: "ticket",
  title: key,
  ...extra,
})

describe("publish UUIDs", () => {
  test("derives a stable UUID v4 from the parent and key", () => {
    const uuid = publishUuid({ parentId: "issue-RAT-1", teamId: "00000000-0000-0000-0000-000000000001", key: "spec" })

    expect(uuid).toBe("0d5b279e-f726-4470-a828-c8cdd4528abc")
    expect(publishUuid({ parentId: "issue-RAT-1", teamId: "00000000-0000-0000-0000-000000000001", key: "spec" })).toBe(uuid)
    expect(publishUuid({ parentId: "issue-RAT-1", teamId: "00000000-0000-0000-0000-000000000001", key: "client" })).not.toBe(uuid)
    expect(publishUuid({ parentId: "issue-RAT-2", teamId: "00000000-0000-0000-0000-000000000001", key: "spec" })).not.toBe(uuid)
    expect(uuid).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u)
  })

  test("scopes a top-level node to its team", () => {
    const first = publishUuid({ parentId: null, teamId: "00000000-0000-0000-0000-000000000001", key: "spec" })
    const second = publishUuid({ parentId: null, teamId: "team-2", key: "spec" })

    expect(first).toBe("95fad5ea-3b07-44a8-8076-7a375cc62a1f")
    expect(first).not.toBe(second)
  })
})

describe("publish order", () => {
  test("places parents before children and blockers before blocked nodes", () => {
    const ordered = publishOrder([
      node("cache", { parent: "client", blockedBy: ["client"] }),
      node("client", { parent: "spec" }),
      node("spec"),
    ])

    expect(ordered).toEqual(Result.succeed(["spec", "client", "cache"]))
  })

  test("keeps the document order for independent nodes", () => {
    const ordered = publishOrder([node("third"), node("first"), node("second")])

    expect(ordered).toEqual(Result.succeed(["third", "first", "second"]))
  })

  test("rejects a duplicate key", () => {
    const ordered = publishOrder([node("same"), node("same")])

    expect(Result.isFailure(ordered)).toBe(true)
    if (Result.isFailure(ordered)) {
      expect(ordered.failure).toBeInstanceOf(TrackerError)
      expect(ordered.failure).toMatchObject({
        code: "validation",
        message: "The publish document has two nodes with the key same.",
      })
    }
  })

  test("rejects a missing parent key", () => {
    const ordered = publishOrder([node("child", { parent: "missing" })])

    expect(Result.isFailure(ordered)).toBe(true)
    if (Result.isFailure(ordered)) {
      expect(ordered.failure).toMatchObject({
        code: "validation",
        message:
          "The parent of node child names missing, which is not a node key or an issue reference.",
      })
    }
  })

  test("rejects a missing blocking key", () => {
    const ordered = publishOrder([node("child", { blockedBy: ["missing"] })])

    expect(Result.isFailure(ordered)).toBe(true)
    if (Result.isFailure(ordered)) {
      expect(ordered.failure).toMatchObject({
        code: "validation",
        message:
          "The blockedBy of node child names missing, which is not a node key or an issue reference.",
      })
    }
  })

  test("rejects a parent cycle", () => {
    const ordered = publishOrder([node("a", { parent: "b" }), node("b", { parent: "a" })])

    expect(Result.isFailure(ordered)).toBe(true)
    if (Result.isFailure(ordered)) {
      expect(ordered.failure).toMatchObject({
        code: "validation",
        message: "The publish graph has a cycle among: a, b.",
      })
    }
  })

  test("rejects a blocking cycle", () => {
    const ordered = publishOrder([node("a", { blockedBy: ["b"] }), node("b", { blockedBy: ["a"] })])

    expect(Result.isFailure(ordered)).toBe(true)
    if (Result.isFailure(ordered)) {
      expect(ordered.failure).toMatchObject({
        code: "validation",
        message: "The publish graph has a cycle among: a, b.",
      })
    }
  })

  test("rejects a mixed parent and blocking cycle", () => {
    const ordered = publishOrder([node("a", { parent: "b" }), node("b", { blockedBy: ["a"] })])

    expect(Result.isFailure(ordered)).toBe(true)
    if (Result.isFailure(ordered)) {
      expect(ordered.failure).toMatchObject({
        code: "validation",
        message: "The publish graph has a cycle among: a, b.",
      })
    }
  })

  test("rejects an empty document", () => {
    const ordered = publishOrder([])

    expect(Result.isFailure(ordered)).toBe(true)
    if (Result.isFailure(ordered)) {
      expect(ordered.failure).toMatchObject({
        code: "validation",
        message: "The publish document has no nodes.",
      })
    }
  })
})
