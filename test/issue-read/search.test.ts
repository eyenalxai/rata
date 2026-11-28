import { lastJson, lastJsonRecord, runIssueMemory } from "@test/cli-harness"
import { makeIssue, seed } from "@test/issue-read/fixtures"
import { describe, expect, test } from "bun:test"
import { Option, Schema } from "effect"

const PageDocument = Schema.Struct({
  issues: Schema.Array(Schema.Record(Schema.String, Schema.Unknown)),
  pageInfo: Schema.Record(Schema.String, Schema.Unknown),
})

const pageOf = (lines: readonly string[]) =>
  Option.getOrThrow(Schema.decodeUnknownOption(PageDocument)(lastJson(lines)))

const extraIssues = () =>
  Array.from({ length: 12 }, (_, index) =>
    makeIssue({ identifier: `RAT-${20 + index}`, title: `Searchable ${index}` }),
  )

describe("issue search", () => {
  test("returns ten summary rows by default", async () => {
    const lines: string[] = []
    await runIssueMemory(seed(extraIssues()), ["search", "Searchable", "--format", "json"], lines)

    const page = pageOf(lines)
    expect(page.issues).toHaveLength(10)
    expect(page.pageInfo).toEqual({ hasNextPage: true, endCursor: "issue-RAT-29" })
    expect(page.issues.every((issue) => !Object.hasOwn(issue, "description"))).toBe(true)
  })

  test("--after continues the search page", async () => {
    const first: string[] = []
    await runIssueMemory(
      seed(extraIssues()),
      ["search", "Searchable", "--limit", "1", "--format", "json"],
      first,
    )
    expect(lastJsonRecord(first).pageInfo).toEqual({
      hasNextPage: true,
      endCursor: "issue-RAT-20",
    })

    const second: string[] = []
    await runIssueMemory(
      seed(extraIssues()),
      ["search", "Searchable", "--limit", "1", "--after", "issue-RAT-20", "--format", "json"],
      second,
    )
    expect(pageOf(second).issues[0]?.identifier).toBe("RAT-21")
  })

  test("--limit and --all drain the search", async () => {
    const limited: string[] = []
    await runIssueMemory(
      seed(extraIssues()),
      ["search", "Searchable", "--limit", "12", "--format", "json"],
      limited,
    )
    expect(pageOf(limited).issues).toHaveLength(12)

    const all: string[] = []
    await runIssueMemory(
      seed(extraIssues()),
      ["search", "Searchable", "--limit", "1", "--all", "--format", "json"],
      all,
    )
    expect(pageOf(all).issues).toHaveLength(12)
    expect(lastJsonRecord(all).pageInfo).toEqual({ hasNextPage: false, endCursor: null })
  })
})
