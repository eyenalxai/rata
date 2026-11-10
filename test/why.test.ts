import type { Handler } from "@test/fake-linear/model"

import { lastJson, lastJsonRecord, runRoot } from "@test/cli-harness"
import { baseDetail, jsonResponse, pageInfo, summaryKeys } from "@test/issue-fixtures"
import { afterEach, describe, expect, test } from "bun:test"
import { Option, Schema } from "effect"

const Blocker = Schema.Struct({
  identifier: Schema.String,
  title: Schema.String,
  state: Schema.Struct({ name: Schema.String, type: Schema.String }),
  closed: Schema.Boolean,
})

const WhyDocument = Schema.Struct({
  identifier: Schema.String,
  title: Schema.String,
  createdAt: Schema.String,
  blocked: Schema.Boolean,
  blockedBy: Schema.Array(Blocker),
})

const whyDocument = (lines: readonly string[]) =>
  Option.getOrThrow(Schema.decodeUnknownOption(WhyDocument)(lastJson(lines)))

const blocker = (identifier: string, state: { name: string; type: string }) => ({
  id: `i-${identifier}`,
  identifier,
  title: `Title ${identifier}`,
  state,
})

const whyHandler =
  (blockers: readonly unknown[]): Handler =>
  () =>
    jsonResponse({
      data: {
        issue: {
          ...baseDetail,
          inverseRelations: {
            nodes: blockers.map((issue, index) => ({
              id: `relation-${index}`,
              type: "blocks",
              issue,
            })),
            pageInfo,
          },
        },
      },
    })

afterEach(() => {
  process.exitCode = 0
})

describe("rata why", () => {
  test("reports an open blocker", async () => {
    const lines: string[] = []
    await runRoot(
      whyHandler([blocker("RAT-9", { name: "In Progress", type: "started" })]),
      ["why", "RAT-1", "--json"],
      lines,
    )

    const document = whyDocument(lines)
    expect(Object.keys(lastJsonRecord(lines)).toSorted()).toEqual(
      [...summaryKeys, "blocked", "blockedBy"].toSorted(),
    )
    expect(document.identifier).toBe("RAT-1")
    expect(document.title).toBe("The issue")
    expect(document.blocked).toBe(true)
    expect(document.blockedBy).toEqual([
      {
        identifier: "RAT-9",
        title: "Title RAT-9",
        state: { name: "In Progress", type: "started" },
        closed: false,
      },
    ])
  })

  test("treats a completed blocker as closed", async () => {
    const lines: string[] = []
    await runRoot(
      whyHandler([blocker("RAT-9", { name: "Done", type: "completed" })]),
      ["why", "RAT-1", "--json"],
      lines,
    )

    const document = whyDocument(lines)
    expect(document.blocked).toBe(false)
    expect(document.blockedBy[0]?.closed).toBe(true)
  })

  test("treats a canceled blocker as closed", async () => {
    const lines: string[] = []
    await runRoot(
      whyHandler([blocker("RAT-8", { name: "Canceled", type: "canceled" })]),
      ["why", "RAT-1", "--json"],
      lines,
    )

    const document = whyDocument(lines)
    expect(document.blocked).toBe(false)
    expect(document.blockedBy[0]?.closed).toBe(true)
  })

  test("reports ready when there are no blockers", async () => {
    const lines: string[] = []
    await runRoot(whyHandler([]), ["why", "RAT-1", "--json"], lines)

    const document = whyDocument(lines)
    expect(document.blocked).toBe(false)
    expect(document.blockedBy).toEqual([])
  })

  test("selects fields from the summary and the blockers", async () => {
    const lines: string[] = []
    await runRoot(
      whyHandler([blocker("RAT-9", { name: "In Progress", type: "started" })]),
      ["why", "RAT-1", "--json", "--fields", "identifier,blocked,blockedBy"],
      lines,
    )

    expect(lastJson(lines)).toEqual({
      identifier: "RAT-1",
      blocked: true,
      blockedBy: [
        {
          identifier: "RAT-9",
          title: "Title RAT-9",
          state: { name: "In Progress", type: "started" },
          closed: false,
        },
      ],
    })
  })

  test("prints the open blockers in human output", async () => {
    const lines: string[] = []
    await runRoot(
      whyHandler([
        blocker("RAT-9", { name: "In Progress", type: "started" }),
        blocker("RAT-8", { name: "Todo", type: "unstarted" }),
      ]),
      ["why", "RAT-1"],
      lines,
    )

    expect(lines).toEqual([
      "RAT-1 is blocked by:",
      "  RAT-9  [In Progress]  Title RAT-9",
      "  RAT-8  [Todo]  Title RAT-8",
    ])
  })

  test("prints ready in human output when every blocker is closed", async () => {
    const lines: string[] = []
    await runRoot(
      whyHandler([blocker("RAT-9", { name: "Done", type: "completed" })]),
      ["why", "RAT-1"],
      lines,
    )

    expect(lines).toEqual(["RAT-1 is ready."])
  })
})
