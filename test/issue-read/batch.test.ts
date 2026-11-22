import { lastJson, lastJsonRecord, runIssueMemory } from "@test/cli-harness"
import { countingGateway } from "@test/fake-linear/gateway/counting"
import { seed } from "@test/issue-read/fixtures"
import { afterEach, describe, expect, test } from "bun:test"
import { Option, Schema } from "effect"

const ItemsDocument = Schema.Struct({
  items: Schema.Array(Schema.Struct({ identifier: Schema.String })),
})
const SelectedDocument = Schema.Struct({
  children: Schema.Array(Schema.String),
  frontier: Schema.Array(Schema.String),
})

afterEach(() => {
  process.exitCode = 0
})

describe("issue <ref>...", () => {
  test("reads many refs in one working-set request", async () => {
    const counting = countingGateway(seed())
    const lines: string[] = []
    await runIssueMemory(seed(), ["RAT-1", "RAT-2", "RAT-3", "--format", "json"], lines, [], {
      gateway: counting.gateway,
    })

    const page = Option.getOrThrow(Schema.decodeUnknownOption(ItemsDocument)(lastJson(lines)))
    expect(counting.counts.workingSets()).toBe(1)
    expect(lastJsonRecord(lines).pageInfo).toEqual({ hasNextPage: false, endCursor: null })
    expect(page.items.map((item) => item.identifier)).toEqual(["RAT-1", "RAT-2", "RAT-3"])
  })

  test("selects fields through arrays", async () => {
    const lines: string[] = []
    await runIssueMemory(
      seed(),
      ["RAT-1", "--select", "children.identifier,frontier.identifier", "--format", "json"],
      lines,
    )

    expect(
      Option.getOrThrow(Schema.decodeUnknownOption(SelectedDocument)(lastJson(lines))),
    ).toEqual({
      children: ["RAT-2", "RAT-6", "RAT-3", "RAT-4", "RAT-5"],
      frontier: ["RAT-2", "RAT-6"],
    })
  })

  test("rejects an unknown selected path", async () => {
    const lines: string[] = []
    await runIssueMemory(seed(), ["RAT-1", "--select", "children.naem"], lines)

    expect(lastJsonRecord(lines)).toMatchObject({ error: { code: "validation" } })
    expect(process.exitCode).toBe(2)
  })
})
