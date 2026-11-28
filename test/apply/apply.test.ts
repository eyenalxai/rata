/* oxlint-disable unicorn/no-await-expression-member, max-lines -- behaviour tests read many fields from one result; grouping them by command keeps the file reviewable. */
import type { MemorySeed } from "@test/fake-linear/gateway/model"

import { issueWithDuplicateHeading, seed } from "@test/apply/fixtures"
import { lastJson, runIssueMemory, runRootMemory } from "@test/cli-harness"
import { makeMemoryGateway } from "@test/fake-linear/gateway/memory"
import { afterEach, describe, expect, test } from "bun:test"
import { Option, Schema, Stream } from "effect"

import type { LinearGatewayShape } from "@/linear/gateway"

const recordOf = (value: unknown): Record<string, unknown> =>
  Option.getOrThrow(Schema.decodeUnknownOption(Schema.Record(Schema.String, Schema.Unknown))(value))

const resultOf = (lines: readonly string[]): Record<string, unknown> =>
  recordOf(recordOf(lastJson(lines)).result)

const runApply = async (
  seedValue: MemorySeed,
  gateway: LinearGatewayShape,
  document: unknown,
  ref = "RAT-1",
  extraArgs: readonly string[] = [],
) => {
  const lines: string[] = []
  await runIssueMemory(
    seedValue,
    ["apply", ref, "--file", "-", "--format", "json", ...extraArgs],
    lines,
    undefined,
    {
      gateway,
      stdio: { stdin: Stream.make(new TextEncoder().encode(JSON.stringify(document))) },
    },
  )
  return lines
}

const readIssue = async (seedValue: MemorySeed, gateway: LinearGatewayShape, ref = "RAT-1") => {
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

afterEach(() => {
  process.exitCode = 0
})

describe("issue apply", () => {
  test("updates fields, labels, sections, a comment and relations in one document", async () => {
    const seedValue = seed()
    const gateway = makeMemoryGateway(seedValue)
    const lines = await runApply(seedValue, gateway, {
      title: "The map, updated",
      state: "Done",
      assignee: "me",
      priority: "urgent",
      labels: { add: ["bug"], remove: ["ready-for-agent"] },
      sections: [
        { heading: "Notes", mode: "replace", content: "Replaced." },
        { heading: "Handoff log", mode: "append", content: "PR #42 is open." },
      ],
      comment: { body: "All done.", dedupeKey: "apply-1" },
      relations: { related: ["RAT-3"] },
    })

    const result = resultOf(lines)
    expect(result).toMatchObject({
      action: "apply",
      status: "updated",
      dryRun: false,
      snapshot: "2026-01-03T00:00:00.000Z",
    })
    expect(result.changed).toEqual([
      "title",
      "state",
      "assignee",
      "priority",
      "label:+bug",
      "label:-ready-for-agent",
      "section:Notes",
      "section:Handoff log",
      "comment",
      "relation:related:RAT-3",
    ])
    expect(result.actions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ action: "update-fields", status: "updated" }),
        expect.objectContaining({ action: "add-label", status: "updated" }),
        expect.objectContaining({ action: "remove-label", status: "updated" }),
        expect.objectContaining({ action: "section-replace", status: "updated" }),
        expect.objectContaining({ action: "section-append", status: "updated" }),
        expect.objectContaining({ action: "comment-create", status: "updated" }),
        expect.objectContaining({ action: "relation-add", status: "updated" }),
      ]),
    )

    const issue = await readIssue(seedValue, gateway)
    expect(issue).toMatchObject({
      title: "The map, updated",
      state: { name: "Done", type: "completed" },
      priority: "urgent",
      assignee: { id: "user-1" },
    })
    expect(issue.description).toBe(
      "# Destination\nShip the write.\n\n## Notes\n\nReplaced.\n\n## Handoff log\n\nPR #42 is open.",
    )
    expect(issue.labels).toEqual([expect.objectContaining({ name: "bug" })])
    expect(issue.comments).toEqual([expect.objectContaining({ body: "All done." })])
    expect(issue.relations).toMatchObject({
      blocks: [expect.objectContaining({ identifier: "RAT-2" })],
      blockedBy: [expect.objectContaining({ identifier: "RAT-9" })],
      related: [expect.objectContaining({ identifier: "RAT-3" })],
    })
  })

  test("a dry run returns the plan and writes nothing", async () => {
    const seedValue = seed()
    const gateway = makeMemoryGateway(seedValue)
    const lines = await runApply(
      seedValue,
      gateway,
      {
        title: "Changed title",
        labels: { add: ["bug"] },
        comment: { body: "Changed.", dedupeKey: "dry-1" },
      },
      "RAT-1",
      ["--dry-run"],
    )

    const result = resultOf(lines)
    expect(result).toMatchObject({ status: "updated", dryRun: true })
    expect(result.changed).toEqual(["title", "label:+bug", "comment"])

    const issue = await readIssue(seedValue, gateway)
    expect(issue.title).toBe("The map")
    expect(issue.labels).toEqual([expect.objectContaining({ name: "ready-for-agent" })])
    expect(issue.comments).toEqual([])
  })

  test("a no-op returns skipped", async () => {
    const seedValue = seed()
    const gateway = makeMemoryGateway(seedValue)
    const lines = await runApply(seedValue, gateway, {
      title: "The map",
      labels: { add: ["ready-for-agent"] },
      relations: { blockedBy: ["RAT-9"], blocks: ["RAT-2"] },
    })

    expect(resultOf(lines)).toMatchObject({ status: "skipped", changed: [] })
  })

  test("a stale --if-unchanged exits 4", async () => {
    const seedValue = seed()
    const gateway = makeMemoryGateway(seedValue)
    const lines = await runApply(seedValue, gateway, { title: "Changed title" }, "RAT-1", [
      "--if-unchanged",
      "2025-01-01T00:00:00.000Z",
    ])

    expect(process.exitCode).toBe(4)
    expect(lastJson(lines)).toMatchObject({ error: { code: "conflict" } })
    expect((await readIssue(seedValue, gateway)).title).toBe("The map")
  })

  test("a dry run with a stale --if-unchanged exits 4", async () => {
    const seedValue = seed()
    const gateway = makeMemoryGateway(seedValue)
    const lines = await runApply(seedValue, gateway, { title: "Changed title" }, "RAT-1", [
      "--dry-run",
      "--if-unchanged",
      "2025-01-01T00:00:00.000Z",
    ])

    expect(process.exitCode).toBe(4)
    expect(lastJson(lines)).toMatchObject({ error: { code: "conflict" } })
    expect((await readIssue(seedValue, gateway)).title).toBe("The map")
  })

  test("apply rejects the old --fields flag", async () => {
    const seedValue = seed()
    const gateway = makeMemoryGateway(seedValue)
    const lines: string[] = []
    await runRootMemory(
      seedValue,
      ["issue", "apply", "RAT-1", "--file", "-", "--format", "json", "--fields", "title"],
      lines,
      undefined,
      {
        gateway,
        stdio: {
          stdin: Stream.make(new TextEncoder().encode(JSON.stringify({ title: "Changed" }))),
        },
      },
    )

    expect(process.exitCode).toBe(2)
    expect(lastJson(lines)).toMatchObject({
      error: { code: "usage", hint: "Use --format json; --select replaces --fields." },
    })
  })

  test("a partial failure returns the applied actions and the failed action", async () => {
    const seedValue = seed({ failOn: ["mutation CreateComment"] })
    const gateway = makeMemoryGateway(seedValue)
    const lines = await runApply(seedValue, gateway, {
      title: "Changed title",
      comment: { body: "Cannot post.", dedupeKey: "fail-1" },
    })

    const result = resultOf(lines)
    expect(result).toMatchObject({
      status: "failed",
      changed: ["title"],
      failed: {
        action: "comment-create",
        status: "failed",
      },
      error: { code: "internal" },
    })
    expect(result.actions).toEqual([
      expect.objectContaining({ action: "update-fields", status: "updated" }),
    ])
    expect(process.exitCode).toBe(1)
    expect((await readIssue(seedValue, gateway)).title).toBe("Changed title")
  })
})

describe("issue apply sections", () => {
  test("replace rewrites the content under one heading", async () => {
    const seedValue = seed()
    const gateway = makeMemoryGateway(seedValue)
    const lines = await runApply(seedValue, gateway, {
      sections: [{ heading: "Notes", mode: "replace", content: "Replaced." }],
    })

    expect(resultOf(lines).status).toBe("updated")
    expect((await readIssue(seedValue, gateway)).description).toBe(
      "# Destination\nShip the write.\n\n## Notes\n\nReplaced.",
    )
  })

  test("append adds content to an existing section", async () => {
    const seedValue = seed()
    const gateway = makeMemoryGateway(seedValue)
    await runApply(seedValue, gateway, {
      sections: [{ heading: "Notes", mode: "append", content: "Appended." }],
    })

    expect((await readIssue(seedValue, gateway)).description).toBe(
      "# Destination\nShip the write.\n\n## Notes\nA note.\n\nAppended.",
    )
  })

  test("append creates a missing heading at the end", async () => {
    const seedValue = seed()
    const gateway = makeMemoryGateway(seedValue)
    await runApply(seedValue, gateway, {
      sections: [{ heading: "Handoff log", mode: "append", content: "PR #42 is open." }],
    })

    expect((await readIssue(seedValue, gateway)).description).toBe(
      "# Destination\nShip the write.\n\n## Notes\nA note.\n\n## Handoff log\n\nPR #42 is open.",
    )
  })

  test("a replace of a missing heading fails before the first write", async () => {
    const seedValue = seed()
    const gateway = makeMemoryGateway(seedValue)
    const lines = await runApply(seedValue, gateway, {
      title: "Changed title",
      sections: [{ heading: "Missing", mode: "replace", content: "Nothing." }],
    })

    expect(lastJson(lines)).toMatchObject({ error: { code: "not_found" } })
    expect((await readIssue(seedValue, gateway)).title).toBe("The map")
  })

  test("a duplicate heading is a conflict", async () => {
    const seedValue = seed({ issues: [issueWithDuplicateHeading] })
    const gateway = makeMemoryGateway(seedValue)
    const lines = await runApply(
      seedValue,
      gateway,
      { sections: [{ heading: "Notes", mode: "replace", content: "Replaced." }] },
      "RAT-20",
    )

    expect(process.exitCode).toBe(4)
    expect(lastJson(lines)).toMatchObject({ error: { code: "conflict" } })
  })
})

describe("issue apply relations and comments", () => {
  test("relations are a set: an existing edge is skipped", async () => {
    const seedValue = seed()
    const gateway = makeMemoryGateway(seedValue)
    const lines = await runApply(seedValue, gateway, {
      relations: {
        blocks: ["RAT-2"],
        blockedBy: ["RAT-9"],
        related: ["RAT-3"],
        duplicate: ["RAT-4"],
      },
    })

    const result = resultOf(lines)
    expect(result.status).toBe("updated")
    expect(result.changed).toEqual(["relation:related:RAT-3", "relation:duplicate:RAT-4"])
    expect(result.actions).toEqual([
      expect.objectContaining({ action: "relation-add", status: "skipped" }),
      expect.objectContaining({ action: "relation-add", status: "skipped" }),
      expect.objectContaining({ action: "relation-add", status: "updated" }),
      expect.objectContaining({ action: "relation-add", status: "updated" }),
    ])
    expect((await readIssue(seedValue, gateway)).relations).toMatchObject({
      blocks: [expect.objectContaining({ identifier: "RAT-2" })],
      blockedBy: [expect.objectContaining({ identifier: "RAT-9" })],
      related: [expect.objectContaining({ identifier: "RAT-3" })],
      duplicates: [expect.objectContaining({ identifier: "RAT-4" })],
    })
  })

  test("a comment dedupe key makes a retry skipped", async () => {
    const seedValue = seed()
    const gateway = makeMemoryGateway(seedValue)
    const document = { comment: { body: "Started.", dedupeKey: "start-1" } }

    const first = await runApply(seedValue, gateway, document)
    expect(resultOf(first)).toMatchObject({ status: "updated" })

    const second = await runApply(seedValue, gateway, document)
    expect(resultOf(second)).toMatchObject({ status: "skipped", changed: [] })

    expect((await readIssue(seedValue, gateway)).comments).toEqual([
      expect.objectContaining({ body: "Started." }),
    ])
  })

  test("issue relate adds and removes one edge", async () => {
    const seedValue = seed()
    const gateway = makeMemoryGateway(seedValue)
    const added: string[] = []
    await runIssueMemory(
      seedValue,
      ["relate", "RAT-1", "--related", "RAT-3", "--format", "json"],
      added,
      undefined,
      { gateway },
    )
    expect(resultOf(added)).toMatchObject({ action: "relate", status: "updated" })
    expect((await readIssue(seedValue, gateway)).relations).toMatchObject({
      related: [expect.objectContaining({ identifier: "RAT-3" })],
    })

    const removed: string[] = []
    await runIssueMemory(
      seedValue,
      ["relate", "RAT-1", "--related", "RAT-3", "--remove", "--format", "json"],
      removed,
      undefined,
      { gateway },
    )
    expect(resultOf(removed)).toMatchObject({ action: "relate", status: "updated" })
    expect((await readIssue(seedValue, gateway)).relations).toMatchObject({ related: [] })
  })

  test("issue comment posts one comment", async () => {
    const seedValue = seed()
    const gateway = makeMemoryGateway(seedValue)
    const lines: string[] = []
    await runIssueMemory(
      seedValue,
      ["comment", "RAT-1", "--body-file", "-", "--dedupe-key", "note-1", "--format", "json"],
      lines,
      undefined,
      {
        gateway,
        stdio: { stdin: Stream.make(new TextEncoder().encode("A note.")) },
      },
    )

    expect(resultOf(lines)).toMatchObject({ action: "comment", status: "updated" })
    expect((await readIssue(seedValue, gateway)).comments).toEqual([
      expect.objectContaining({ body: "A note." }),
    ])
  })

  test("issue comment requires a dedupe key", async () => {
    const seedValue = seed()
    const gateway = makeMemoryGateway(seedValue)
    const lines: string[] = []
    await runIssueMemory(
      seedValue,
      ["comment", "RAT-1", "--body-file", "-", "--format", "json"],
      lines,
      undefined,
      {
        gateway,
        stdio: { stdin: Stream.make(new TextEncoder().encode("A note.")) },
      },
    )

    expect(process.exitCode).toBe(2)
    expect(lastJson(lines)).toMatchObject({ error: { code: "validation" } })
    expect((await readIssue(seedValue, gateway)).comments).toEqual([])
  })

  test("issue comment retry with the same key is skipped", async () => {
    const seedValue = seed()
    const gateway = makeMemoryGateway(seedValue)
    const run = async () => {
      const lines: string[] = []
      await runIssueMemory(
        seedValue,
        ["comment", "RAT-1", "--body-file", "-", "--dedupe-key", "note-2", "--format", "json"],
        lines,
        undefined,
        {
          gateway,
          stdio: { stdin: Stream.make(new TextEncoder().encode("A note.")) },
        },
      )
      return lines
    }

    expect(resultOf(await run())).toMatchObject({ status: "updated" })
    expect(resultOf(await run())).toMatchObject({ status: "skipped" })
    expect((await readIssue(seedValue, gateway)).comments).toHaveLength(1)
  })
})

describe("removed write forms", () => {
  const removedForms = [
    ["update", "RAT-1", "--state", "Done"],
    ["label", "add", "RAT-1", "bug"],
    ["section", "replace", "RAT-1", "Notes", "--body-file", "-"],
    ["assign", "RAT-1", "--assignee", "me"],
    ["unassign", "RAT-1"],
    ["reopen", "RAT-1"],
    ["link", "RAT-1", "--blocks", "RAT-2"],
    ["unlink", "RAT-1", "--blocks", "RAT-2"],
    ["comment", "create", "RAT-1", "--body-file", "-"],
  ] as const

  for (const args of removedForms) {
    test(`${args[0]} exits 2`, async () => {
      const lines: string[] = []
      await runRootMemory(seed(), ["issue", ...args, "--format", "json"], lines)
      expect(process.exitCode).toBe(2)
      expect(lastJson(lines)).toMatchObject({ error: { code: "usage" } })
    })
  }
})
