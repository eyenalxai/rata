import type { MemoryIssue, MemorySeed } from "@test/fake-linear/gateway/model"

import { issueChild, issueWithDuplicateHeading, related, seed } from "@test/apply/fixtures"
import { lastJson, runIssueMemory, runRootMemory } from "@test/cli-harness"
import { makeMemoryGateway } from "@test/fake-linear/gateway/memory"
import { afterEach, describe, expect, test } from "bun:test"
import { Effect, Option, Schema, Stream } from "effect"

import type { LinearApiError } from "@/linear/errors"
import type { LinearGatewayShape } from "@/linear/gateway"

import { LinearGraphQLError } from "@/linear/errors"

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

const failWith = (message: string) => new LinearGraphQLError({ message, details: [] })

const wrapExecute = (
  gateway: LinearGatewayShape,
  wrap: <A>(
    query: string,
    effect: Effect.Effect<A, LinearApiError>,
  ) => Effect.Effect<A, LinearApiError>,
): LinearGatewayShape => {
  const client: LinearGatewayShape["client"] = {
    ...gateway.client,
    execute: (query, variables, data) =>
      wrap(query, gateway.client.execute(query, variables, data)),
  }
  return { ...gateway, client }
}

const withMapRelations = (
  seedValue: MemorySeed,
  relations: MemoryIssue["relations"],
  inverseRelations: MemoryIssue["inverseRelations"],
): MemorySeed => ({
  ...seedValue,
  issues: (seedValue.issues ?? []).map((issue) =>
    issue.summary.identifier === "RAT-1" ? { ...issue, relations, inverseRelations } : issue,
  ),
})

describe("issue apply review regressions", () => {
  test("a stale --if-unchanged fails a dry run with a conflict", async () => {
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

  test("a dry run for sections and relations writes nothing", async () => {
    const seedValue = seed()
    const gateway = makeMemoryGateway(seedValue)
    const lines = await runApply(
      seedValue,
      gateway,
      {
        sections: [{ heading: "Notes", mode: "replace", content: "Dry." }],
        relations: { related: ["RAT-3"] },
      },
      "RAT-1",
      ["--dry-run"],
    )

    expect(resultOf(lines)).toMatchObject({ status: "updated", dryRun: true })
    const issue = await readIssue(seedValue, gateway)
    expect(issue.description).toBe("# Destination\nShip the write.\n\n## Notes\nA note.")
    expect(issue.relations).toMatchObject({ related: [] })
  })

  test("issue comment requires a dedupe key", async () => {
    const seedValue = seed()
    const gateway = makeMemoryGateway(seedValue)
    const lines: string[] = []
    await runIssueMemory(
      seedValue,
      ["comment", "RAT-1", "--body-file", "-", "--dedupe-key", "", "--format", "json"],
      lines,
      undefined,
      {
        gateway,
        stdio: { stdin: Stream.make(new TextEncoder().encode("A note.")) },
      },
    )

    expect(process.exitCode).toBe(2)
    expect(lastJson(lines)).toMatchObject({
      error: { code: "validation", message: "The --dedupe-key flag is empty." },
    })
    expect((await readIssue(seedValue, gateway)).comments).toEqual([])
  })

  test("the same comment key on another issue creates a new comment", async () => {
    const seedValue = seed()
    const gateway = makeMemoryGateway(seedValue)
    const run = (ref: string) => {
      const lines: string[] = []
      return runIssueMemory(
        seedValue,
        ["comment", ref, "--body-file", "-", "--dedupe-key", "handoff", "--format", "json"],
        lines,
        undefined,
        {
          gateway,
          stdio: { stdin: Stream.make(new TextEncoder().encode("Handoff.")) },
        },
      ).then(() => resultOf(lines))
    }
    const [first, second] = await Promise.all([run("RAT-1"), run("RAT-2")])
    expect(first).toMatchObject({ status: "updated" })
    expect(second).toMatchObject({ status: "updated" })

    expect((await readIssue(seedValue, gateway, "RAT-1")).comments).toHaveLength(1)
    expect((await readIssue(seedValue, gateway, "RAT-2")).comments).toHaveLength(1)
  })

  test("a duplicate create error recovers the keyed comment", async () => {
    const seedValue = seed()
    const gateway = makeMemoryGateway(seedValue)
    const racing = wrapExecute(gateway, (query, effect) =>
      query.includes("mutation CreateComment")
        ? effect.pipe(Effect.flatMap(() => Effect.fail(failWith("Duplicate comment id"))))
        : effect,
    )
    const lines: string[] = []
    await runIssueMemory(
      seedValue,
      ["comment", "RAT-1", "--body-file", "-", "--dedupe-key", "race", "--format", "json"],
      lines,
      undefined,
      {
        gateway: racing,
        stdio: { stdin: Stream.make(new TextEncoder().encode("Handoff.")) },
      },
    )

    expect(resultOf(lines)).toMatchObject({ status: "updated" })
    expect((await readIssue(seedValue, gateway)).comments).toEqual([
      expect.objectContaining({ body: "Handoff." }),
    ])
  })

  test("relation removal deletes one edge at a time and records each deletion", async () => {
    const base = seed()
    const target = base.issues?.find((issue) => issue.summary.identifier === "RAT-3") ?? related
    const seedValue = withMapRelations(
      base,
      [{ type: "related", relatedIssue: issueChild(target) }],
      [{ type: "related", issue: issueChild(target) }],
    )
    const gateway = makeMemoryGateway(seedValue)
    const lines: string[] = []
    await runIssueMemory(
      seedValue,
      ["relate", "RAT-1", "--related", "RAT-3", "--remove", "--format", "json"],
      lines,
      undefined,
      { gateway },
    )

    const result = resultOf(lines)
    expect(result.status).toBe("updated")
    expect(result.changed).toEqual(["relation:related:RAT-3", "relation:related:RAT-3"])
    expect(result.actions).toEqual([
      expect.objectContaining({ action: "relation-remove", status: "updated" }),
      expect.objectContaining({ action: "relation-remove", status: "updated" }),
    ])
    expect((await readIssue(seedValue, gateway)).relations).toMatchObject({ related: [] })
  })

  test("a failed relation removal keeps the earlier deletion and the failed action", async () => {
    const base = seed()
    const target = base.issues?.find((issue) => issue.summary.identifier === "RAT-3") ?? related
    const seedValue = withMapRelations(
      base,
      [{ type: "related", relatedIssue: issueChild(target) }],
      [{ type: "related", issue: issueChild(target) }],
    )
    const gateway = makeMemoryGateway(seedValue)
    let deletes = 0
    const failing = wrapExecute(gateway, (query, effect) => {
      if (!query.includes("mutation IssueRelationDelete")) {
        return effect
      }
      deletes += 1
      return deletes === 1 ? effect : Effect.fail(failWith("The second delete failed."))
    })
    const lines: string[] = []
    await runIssueMemory(
      seedValue,
      ["relate", "RAT-1", "--related", "RAT-3", "--remove", "--format", "json"],
      lines,
      undefined,
      { gateway: failing },
    )

    const result = resultOf(lines)
    expect(result).toMatchObject({
      status: "failed",
      changed: ["relation:related:RAT-3"],
      failed: { action: "relation-remove", target: "RAT-1" },
      error: { code: "internal" },
    })
    expect(result.actions).toEqual([
      expect.objectContaining({ action: "relation-remove", status: "updated" }),
    ])
    expect(process.exitCode).toBe(1)
  })

  test("relation removal follows the incoming direction and sends one delete", async () => {
    const seedValue = seed()
    const gateway = makeMemoryGateway(seedValue)
    let deletes = 0
    const counting = wrapExecute(gateway, (query, effect) => {
      if (query.includes("mutation IssueRelationDelete")) {
        deletes += 1
      }
      return effect
    })
    const lines: string[] = []
    await runIssueMemory(
      seedValue,
      ["relate", "RAT-1", "--blocked-by", "RAT-9", "--remove", "--format", "json"],
      lines,
      undefined,
      { gateway: counting },
    )

    expect(resultOf(lines)).toMatchObject({ status: "updated" })
    expect(deletes).toBe(1)
    expect((await readIssue(seedValue, gateway)).relations).toMatchObject({ blockedBy: [] })
    expect((await readIssue(seedValue, gateway, "RAT-9")).relations).toMatchObject({ blocks: [] })
  })

  test("a comment retry with the same key is skipped", async () => {
    const seedValue = seed()
    const gateway = makeMemoryGateway(seedValue)
    const run = () => {
      const lines: string[] = []
      return runIssueMemory(
        seedValue,
        ["comment", "RAT-1", "--body-file", "-", "--dedupe-key", "retry", "--format", "json"],
        lines,
        undefined,
        {
          gateway,
          stdio: { stdin: Stream.make(new TextEncoder().encode("Once.")) },
        },
      ).then(() => resultOf(lines))
    }

    expect(await run()).toMatchObject({ status: "updated" })
    expect(await run()).toMatchObject({ status: "skipped", changed: [] })
    expect((await readIssue(seedValue, gateway)).comments).toHaveLength(1)
  })

  test("a state that already matches by id is skipped without a write", async () => {
    const seedValue = seed()
    const gateway = makeMemoryGateway(seedValue)
    let updates = 0
    const counting = wrapExecute(gateway, (query, effect) => {
      if (query.includes("mutation UpdateIssue")) {
        updates += 1
      }
      return effect
    })
    const lines = await runApply(seedValue, counting, { state: "In Progress" })

    expect(resultOf(lines)).toMatchObject({ status: "skipped", changed: [] })
    expect(updates).toBe(0)
  })

  test("the new write commands reject --fields in favor of --select", async () => {
    const cases = [
      ["apply", "RAT-1", "--file", "-", "--fields", "result.status", "--json"],
      ["relate", "RAT-1", "--related", "RAT-3", "--fields", "result.status", "--json"],
      [
        "comment",
        "RAT-1",
        "--body-file",
        "-",
        "--dedupe-key",
        "key",
        "--fields",
        "result.status",
        "--json",
      ],
    ] as const
    const results = await Promise.all(
      cases.map((args) => {
        const lines: string[] = []
        return runIssueMemory(seed(), args, lines).then(() => lastJson(lines))
      }),
    )
    for (const result of results) {
      expect(result).toMatchObject({
        error: {
          code: "validation",
          hint: "--fields applies to reads only. Use --select on the write result.",
        },
      })
    }
  })

  test("issue close rejects --fields", async () => {
    const lines: string[] = []
    await runRootMemory(
      seed(),
      ["issue", "close", "RAT-1", "--fields", "identifier", "--json"],
      lines,
    )

    expect(process.exitCode).toBe(2)
    expect(lastJson(lines)).toMatchObject({
      error: {
        code: "validation",
        hint: "--fields applies to reads only. Use --json and jq on the write result.",
      },
    })
  })
})

describe("issue apply relation hints", () => {
  test("relate needs one relation flag", async () => {
    const lines: string[] = []
    await runIssueMemory(seed(), ["relate", "RAT-1", "--format", "json"], lines)
    expect(process.exitCode).toBe(2)
    expect(lastJson(lines)).toMatchObject({
      error: {
        code: "validation",
        message: "Pass one of --blocks, --blocked-by, --related or --duplicate.",
      },
    })
  })

  test("relate takes one relation flag per call", async () => {
    const lines: string[] = []
    await runIssueMemory(
      seed(),
      ["relate", "RAT-1", "--blocks", "RAT-2", "--related", "RAT-3", "--format", "json"],
      lines,
    )
    expect(process.exitCode).toBe(2)
    expect(lastJson(lines)).toMatchObject({
      error: { message: "Pass one relation flag per call." },
    })
  })
})

describe("issue apply section validation", () => {
  test("an empty heading is a validation error", async () => {
    const lines = await runApply(seed(), makeMemoryGateway(seed()), {
      sections: [{ heading: "  ", mode: "append", content: "Nothing." }],
    })
    expect(process.exitCode).toBe(2)
    expect(lastJson(lines)).toMatchObject({ error: { code: "validation" } })
  })

  test("the same heading twice is a conflict", async () => {
    const lines = await runApply(seed(), makeMemoryGateway(seed()), {
      sections: [
        { heading: "Notes", mode: "append", content: "One." },
        { heading: "Notes", mode: "append", content: "Two." },
      ],
    })
    expect(process.exitCode).toBe(4)
    expect(lastJson(lines)).toMatchObject({ error: { code: "conflict" } })
  })
})

describe("issue apply post-write read failure", () => {
  test("a failed read does not mask a partial failure", async () => {
    const seedValue = seed({ failOn: ["mutation CreateComment"] })
    const gateway = makeMemoryGateway(seedValue)
    let written = false
    const tracking = wrapExecute(gateway, (query, effect) =>
      query.includes("mutation")
        ? effect.pipe(
            Effect.tap(() =>
              Effect.sync(() => {
                written = true
              }),
            ),
          )
        : effect,
    )
    const failingRead: LinearGatewayShape = {
      ...tracking,
      issue: {
        ...tracking.issue,
        workingSet: (refs, options) =>
          written
            ? Effect.fail(failWith("The post-write read failed."))
            : tracking.issue.workingSet(refs, options),
      },
    }
    const lines = await runApply(seedValue, failingRead, {
      title: "Changed title",
      comment: { body: "Cannot post.", dedupeKey: "fail-read" },
    })

    const result = resultOf(lines)
    expect(result).toMatchObject({
      status: "failed",
      changed: ["title"],
      failed: { action: "comment-create", status: "failed" },
      error: { code: "internal" },
    })
    expect(result.actions).toEqual([
      expect.objectContaining({ action: "update-fields", status: "updated" }),
    ])
    expect(lastJson(lines)).toMatchObject({ issue: null })
    expect(process.exitCode).toBe(1)
  })
})
