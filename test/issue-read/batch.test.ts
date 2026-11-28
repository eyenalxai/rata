import { lastJson, lastJsonRecord, runIssueMemory } from "@test/cli-harness"
import { countingGateway } from "@test/fake-linear/gateway/counting"
import { seed, documentOf } from "@test/issue-read/fixtures"
import { describe, expect, test } from "bun:test"
import { Option, Schema } from "effect"

const ItemsDocument = Schema.Struct({
  items: Schema.Array(Schema.Struct({ identifier: Schema.String })),
})
const SelectedDocument = Schema.Struct({
  children: Schema.Array(Schema.String),
  frontier: Schema.Array(Schema.String),
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

  test("reports a missing ref in a mixed batch as not_found", async () => {
    const lines: string[] = []
    const exit = await runIssueMemory(
      seed(),
      ["RAT-1", "RAT-404", "RAT-2", "--format", "json"],
      lines,
    )

    expect(lastJsonRecord(lines)).toMatchObject({ error: { code: "not_found" } })
    expect(exit.code).toBe(3)
  })

  test("reports a missing ref as not_found", async () => {
    const lines: string[] = []
    const exit = await runIssueMemory(seed(), ["RAT-404", "--format", "json"], lines)

    expect(lastJsonRecord(lines)).toMatchObject({ error: { code: "not_found" } })
    expect(exit.code).toBe(3)
  })

  test("rejects a malformed ref with validation", async () => {
    const lines: string[] = []
    const exit = await runIssueMemory(seed(), ["not a ref", "--format", "json"], lines)

    expect(lastJsonRecord(lines)).toMatchObject({ error: { code: "validation" } })
    expect(exit.code).toBe(2)
  })

  test("accepts a linear.app URL ref", async () => {
    const lines: string[] = []
    await runIssueMemory(
      seed(),
      ["https://linear.app/acme/issue/RAT-2/ready-child", "--format", "json"],
      lines,
    )

    expect(documentOf(lines).identifier).toBe("RAT-2")
  })

  test("selects summary fields in the working read", async () => {
    const lines: string[] = []
    await runIssueMemory(seed(), ["RAT-1", "--select", "url,labels.name"], lines)

    expect(documentOf(lines)).toEqual({
      labels: ["ready-for-agent"],
      url: "https://linear.app/acme/issue/RAT-1/the-map",
    })
  })

  test("selects relation fields in the full read", async () => {
    const lines: string[] = []
    await runIssueMemory(
      seed(),
      ["RAT-1", "--full", "--select", "relations.blocks.identifier"],
      lines,
    )

    expect(documentOf(lines)).toEqual({
      relations: { blocks: ["RAT-6"] },
    })
  })

  test("rejects a full-only path in the working mode", async () => {
    const lines: string[] = []
    const exit = await runIssueMemory(seed(), ["RAT-1", "--select", "relations.blocks"], lines)

    expect(lastJsonRecord(lines)).toMatchObject({ error: { code: "validation" } })
    expect(exit.code).toBe(2)
  })

  test("rejects an unknown selected path", async () => {
    const lines: string[] = []
    const exit = await runIssueMemory(seed(), ["RAT-1", "--select", "children.naem"], lines)

    expect(lastJsonRecord(lines)).toMatchObject({ error: { code: "validation" } })
    expect(exit.code).toBe(2)
  })
})
