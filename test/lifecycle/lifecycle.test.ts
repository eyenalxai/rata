/* oxlint-disable max-lines -- the lifecycle tests share one memory gateway and one read helper. */
import type { MemorySeed } from "@test/fake-linear/gateway/model"

import { issueChild, makeIssue, seed, viewer } from "@test/apply/fixtures"
import { lastJson, runIssueMemory } from "@test/cli-harness"
import { makeMemoryGateway } from "@test/fake-linear/gateway/memory"
import { describe, expect, test } from "bun:test"
import { Option, Schema, Stream } from "effect"

import type { LinearGatewayShape } from "@/linear/gateway"

import { userId } from "@/domain/id"

const recordOf = (value: unknown): Record<string, unknown> =>
  Option.getOrThrow(Schema.decodeUnknownOption(Schema.Record(Schema.String, Schema.Unknown))(value))

const resultOf = (lines: readonly string[]): Record<string, unknown> =>
  recordOf(recordOf(lastJson(lines)).result)

const errorOf = (lines: readonly string[]): Record<string, unknown> =>
  recordOf(recordOf(lastJson(lines)).error)

const firstOf = (value: unknown): unknown => (Array.isArray(value) ? value[0] : undefined)

const run = async (
  seedValue: MemorySeed,
  gateway: LinearGatewayShape,
  args: readonly string[],
  stdin?: string,
) => {
  const lines: string[] = []
  const exit = await runIssueMemory(seedValue, [...args, "--format", "json"], lines, undefined, {
    gateway,
    ...(stdin === undefined
      ? {}
      : { stdio: { stdin: Stream.make(new TextEncoder().encode(stdin)) } }),
  })
  return { exit, lines }
}

const readDoc = async (seedValue: MemorySeed, gateway: LinearGatewayShape, ref: string) => {
  const lines: string[] = []
  await runIssueMemory(
    seedValue,
    [ref, "--full", "--comments", "--format", "json"],
    lines,
    undefined,
    { gateway },
  )
  return recordOf(lastJson(lines))
}

const other = { id: userId("user-2"), name: "Ada", displayName: "Ada" }

describe("issue start", () => {
  test("claims an unassigned issue and moves it to the first started state", async () => {
    const issue = makeIssue({ identifier: "RAT-30", title: "Start me" })
    const seedValue = seed({ issues: [issue] })
    const gateway = makeMemoryGateway(seedValue)

    const { lines, exit } = await run(seedValue, gateway, ["start", "RAT-30"])

    expect(exit.code).toBe(0)
    expect(resultOf(lines)).toMatchObject({ action: "start", status: "updated", dryRun: false })
    const after = await readDoc(seedValue, gateway, "RAT-30")
    expect(recordOf(after.assignee)).toMatchObject({ id: viewer.id })
    expect(recordOf(after.state)).toMatchObject({ name: "In Progress", type: "started" })

    const { lines: again } = await run(seedValue, gateway, ["start", "RAT-30"])
    expect(resultOf(again)).toMatchObject({ action: "start", status: "skipped" })
  })

  test("skips the viewer's claim and still moves the state", async () => {
    const issue = makeIssue({ identifier: "RAT-31", assignee: viewer })
    const seedValue = seed({ issues: [issue] })
    const gateway = makeMemoryGateway(seedValue)

    const { lines } = await run(seedValue, gateway, ["start", "RAT-31"])

    expect(resultOf(lines)).toMatchObject({ action: "start", status: "updated" })
    expect(resultOf(lines).changed).toContain("state")
    expect(resultOf(lines).changed).not.toContain("assignee")
    const after = await readDoc(seedValue, gateway, "RAT-31")
    expect(recordOf(after.assignee)).toMatchObject({ id: viewer.id })
    expect(recordOf(after.state)).toMatchObject({ name: "In Progress", type: "started" })
  })

  test("another user's claim exits 4 and --take reassigns", async () => {
    const issue = makeIssue({ identifier: "RAT-32", assignee: other })
    const seedValue = seed({ issues: [issue] })
    const gateway = makeMemoryGateway(seedValue)

    const { lines: blocked, exit } = await run(seedValue, gateway, ["start", "RAT-32"])

    expect(exit.code).toBe(4)
    expect(errorOf(blocked)).toMatchObject({ code: "conflict" })
    expect(String(errorOf(blocked).message)).toContain("Ada")
    const unchanged = await readDoc(seedValue, gateway, "RAT-32")
    expect(recordOf(unchanged.assignee)).toMatchObject({ name: "Ada" })

    const { lines: taken } = await run(seedValue, gateway, ["start", "RAT-32", "--take"])
    expect(resultOf(taken)).toMatchObject({ action: "start", status: "updated" })
    const after = await readDoc(seedValue, gateway, "RAT-32")
    expect(recordOf(after.assignee)).toMatchObject({ id: viewer.id })
    expect(recordOf(after.state)).toMatchObject({ name: "In Progress", type: "started" })
  })

  test("moves to a named state", async () => {
    const issue = makeIssue({ identifier: "RAT-33" })
    const seedValue = seed({ issues: [issue] })
    const gateway = makeMemoryGateway(seedValue)

    const { lines } = await run(seedValue, gateway, ["start", "RAT-33", "--state", "Done"])

    expect(resultOf(lines)).toMatchObject({ status: "updated" })
    const after = await readDoc(seedValue, gateway, "RAT-33")
    expect(recordOf(after.state)).toMatchObject({ name: "Done", type: "completed" })
  })

  test("a dry run writes nothing", async () => {
    const issue = makeIssue({ identifier: "RAT-34" })
    const seedValue = seed({ issues: [issue] })
    const gateway = makeMemoryGateway(seedValue)

    const { lines } = await run(seedValue, gateway, ["start", "RAT-34", "--dry-run"])

    expect(resultOf(lines)).toMatchObject({ status: "updated", dryRun: true })
    const after = await readDoc(seedValue, gateway, "RAT-34")
    expect(after.assignee).toBeNull()
    expect(recordOf(after.state)).toMatchObject({ name: "Todo", type: "unstarted" })
  })
})

describe("issue handoff", () => {
  test("attaches the PR, applies the state, a section and one comment; a retry is skipped", async () => {
    const prUrl = "https://github.com/acme/rata/pull/58"
    const issue = makeIssue({
      identifier: "RAT-50",
      title: "Handoff",
      description: "## Handoff\nOld.",
    })
    const seedValue = seed({ issues: [issue] })
    const gateway = makeMemoryGateway(seedValue)
    const document = JSON.stringify({
      pr: prUrl,
      state: "Done",
      sections: [{ heading: "Handoff", mode: "replace", content: "PR #58." }],
      comment: { body: "Handoff is ready.", dedupeKey: "handoff-58" },
    })

    const { lines } = await run(seedValue, gateway, ["handoff", "RAT-50", "--file", "-"], document)

    expect(resultOf(lines)).toMatchObject({ action: "handoff", status: "updated" })
    expect(resultOf(lines).changed).toEqual(
      expect.arrayContaining([`pr:${prUrl}`, "state", "section:Handoff", "comment"]),
    )
    const after = await readDoc(seedValue, gateway, "RAT-50")
    expect(after.prs).toHaveLength(1)
    expect(recordOf(firstOf(after.prs))).toMatchObject({ url: prUrl })
    expect(recordOf(after.state)).toMatchObject({ name: "Done", type: "completed" })
    expect(after.sections).toEqual([
      expect.objectContaining({ heading: "Handoff", content: "PR #58." }),
    ])
    expect(after.comments).toHaveLength(1)

    const { lines: retry } = await run(
      seedValue,
      gateway,
      ["handoff", "RAT-50", "--file", "-"],
      document,
    )

    expect(resultOf(retry)).toMatchObject({ action: "handoff", status: "skipped" })
    const afterRetry = await readDoc(seedValue, gateway, "RAT-50")
    expect(afterRetry.prs).toHaveLength(1)
    expect(afterRetry.comments).toHaveLength(1)
    expect(afterRetry.sections).toHaveLength(1)
  })
})

describe("issue close", () => {
  test("refuses open children without --force and names them", async () => {
    const child = makeIssue({ identifier: "RAT-41", title: "Open child" })
    const parent = {
      ...makeIssue({ identifier: "RAT-40", title: "Parent" }),
      children: [issueChild(child)],
    }
    const seedValue = seed({ issues: [parent, child] })
    const gateway = makeMemoryGateway(seedValue)

    const { lines: blocked, exit } = await run(seedValue, gateway, ["close", "RAT-40"])

    expect(exit.code).toBe(4)
    expect(errorOf(blocked)).toMatchObject({ code: "conflict" })
    expect(String(errorOf(blocked).message)).toContain("RAT-41")
    const unchanged = await readDoc(seedValue, gateway, "RAT-40")
    expect(recordOf(unchanged.state)).toMatchObject({ type: "unstarted" })

    const { lines: forced } = await run(seedValue, gateway, ["close", "RAT-40", "--force"])
    expect(resultOf(forced)).toMatchObject({ action: "close", status: "updated" })
    const after = await readDoc(seedValue, gateway, "RAT-40")
    expect(recordOf(after.state)).toMatchObject({ name: "Done", type: "completed" })
  })

  test("posts one comment, skips a retry and posts a new comment once", async () => {
    const issue = makeIssue({ identifier: "RAT-42", title: "Close me" })
    const seedValue = seed({ issues: [issue] })
    const gateway = makeMemoryGateway(seedValue)

    const { lines: first } = await run(
      seedValue,
      gateway,
      ["close", "RAT-42", "--comment-file", "-"],
      "Done.",
    )
    expect(resultOf(first)).toMatchObject({ action: "close", status: "updated" })
    const after = await readDoc(seedValue, gateway, "RAT-42")
    expect(recordOf(after.state)).toMatchObject({ name: "Done", type: "completed" })
    expect(after.comments).toEqual([expect.objectContaining({ body: "Done." })])

    const { lines: retry } = await run(
      seedValue,
      gateway,
      ["close", "RAT-42", "--comment-file", "-"],
      "Done.",
    )
    expect(resultOf(retry)).toMatchObject({ action: "close", status: "skipped" })
    const afterRetry = await readDoc(seedValue, gateway, "RAT-42")
    expect(afterRetry.comments).toHaveLength(1)

    const { lines: changed } = await run(
      seedValue,
      gateway,
      ["close", "RAT-42", "--comment-file", "-"],
      "Still done.",
    )
    expect(resultOf(changed)).toMatchObject({ action: "close", status: "updated" })
    const afterChanged = await readDoc(seedValue, gateway, "RAT-42")
    expect(afterChanged.comments).toHaveLength(2)
  })

  test("a closed issue without a comment is skipped", async () => {
    const issue = makeIssue({
      identifier: "RAT-43",
      state: { name: "Done", type: "completed" },
    })
    const seedValue = seed({ issues: [issue] })
    const gateway = makeMemoryGateway(seedValue)

    const { lines } = await run(seedValue, gateway, ["close", "RAT-43"])

    expect(resultOf(lines)).toMatchObject({ action: "close", status: "skipped" })
    const after = await readDoc(seedValue, gateway, "RAT-43")
    expect(recordOf(after.state)).toMatchObject({ name: "Done", type: "completed" })
    expect(after.comments).toEqual([])
  })
})
