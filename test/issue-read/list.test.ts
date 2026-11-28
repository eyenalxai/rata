import { lastJson, runIssueMemory } from "@test/cli-harness"
import { seed } from "@test/issue-read/fixtures"
import { describe, expect, test } from "bun:test"
import { Option, Schema } from "effect"

const PageDocument = Schema.Struct({
  issues: Schema.Array(Schema.Record(Schema.String, Schema.Unknown)),
})

const pageOf = (lines: readonly string[]) =>
  Option.getOrThrow(Schema.decodeUnknownOption(PageDocument)(lastJson(lines)))

describe("issue list", () => {
  test("reads a page and adds relation groups with --relations", async () => {
    const lines: string[] = []
    await runIssueMemory(seed(), ["list", "--relations", "--format", "json"], lines)

    const blockedRow = pageOf(lines).issues.find((issue) => issue.identifier === "RAT-3")
    expect(blockedRow?.relations).toEqual(
      expect.objectContaining({
        blockedBy: [expect.objectContaining({ identifier: "RAT-9" })],
      }),
    )
  })
})
