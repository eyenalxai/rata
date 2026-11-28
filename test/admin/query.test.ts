import { describe, expect, test } from "bun:test"

import { findWriteOperation } from "@/cli/admin/query"

describe("admin api operation detection", () => {
  test("accepts a named query", () => {
    expect(findWriteOperation("query Viewer { viewer { id } }")).toBeNull()
  })

  test("accepts an anonymous selection set", () => {
    expect(findWriteOperation("{ viewer { id } }")).toBeNull()
  })

  test("rejects a mutation", () => {
    expect(findWriteOperation("mutation Create { issueCreate { id } }")).toBe("mutation")
  })

  test("rejects a subscription", () => {
    expect(findWriteOperation("subscription Watch { issues { id } }")).toBe("subscription")
  })

  test("rejects a second operation that writes", () => {
    expect(findWriteOperation("query A { viewer { id } } mutation B { issueCreate { id } }")).toBe(
      "mutation",
    )
  })

  test("ignores the words in comments and strings", () => {
    expect(findWriteOperation('# mutation\nquery { search(term: "mutation") { id } }')).toBeNull()
  })

  test("allows an operation or fragment named mutation", () => {
    expect(findWriteOperation("query mutation { viewer { id } }")).toBeNull()
    expect(
      findWriteOperation("fragment mutation on Viewer { id } query { viewer { ...mutation } }"),
    ).toBeNull()
  })

  test("allows a variable named mutation", () => {
    expect(findWriteOperation("query ($mutation: String) { viewer { id } }")).toBeNull()
  })

  test("allows a directive argument named mutation", () => {
    expect(findWriteOperation("query Q @live(mutation: true) { viewer { id } }")).toBeNull()
  })
})
