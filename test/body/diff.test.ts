import { describe, expect, test } from "bun:test"

import { unifiedDiff } from "@/domain/body/diff"

describe("unifiedDiff", () => {
  test("reports a replacement with context", () => {
    expect(unifiedDiff("a\nb\nc\n", "a\nB\nc\n")).toBe(
      ["@@ -1,3 +1,3 @@", " a", "-b", "+B", " c"].join("\n"),
    )
  })

  test("reports an addition at the end", () => {
    expect(unifiedDiff("a\n", "a\nb\n")).toBe(["@@ -1 +1,2 @@", " a", "+b"].join("\n"))
  })

  test("reports a removal", () => {
    expect(unifiedDiff("a\nb\n", "a\n")).toBe(["@@ -1,2 +1 @@", " a", "-b"].join("\n"))
  })

  test("reports an addition at the start", () => {
    expect(unifiedDiff("a\n", "b\na\n")).toBe(["@@ -1 +1,2 @@", "+b", " a"].join("\n"))
  })

  test("returns an empty string when nothing changes", () => {
    expect(unifiedDiff("same\nlines\n", "same\nlines\n")).toBe("")
  })

  test("keeps distant changes in separate hunks", () => {
    const before = ["one", "two", "three", "four", "five", "six", "seven", "eight", "nine"].join(
      "\n",
    )
    const after = before.replace("two", "TWO").replace("nine", "NINE")
    const diff = unifiedDiff(before, after)

    expect(diff.match(/^@@/gmu)).toHaveLength(2)
    expect(diff).toContain("-two")
    expect(diff).toContain("+TWO")
    expect(diff).toContain("-nine")
    expect(diff).toContain("+NINE")
  })

  test("normalizes CRLF line endings", () => {
    expect(unifiedDiff("a\r\nb\r\n", "a\r\nB\r\n")).toBe(
      ["@@ -1,2 +1,2 @@", " a", "-b", "+B"].join("\n"),
    )
  })
})
