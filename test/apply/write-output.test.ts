import type { MemorySeed } from "@test/fake-linear/gateway/model"

import { makeIssue, seed, viewer } from "@test/apply/fixtures"
import { lastJsonRecord, runIssueMemory } from "@test/cli-harness"
import { makeMemoryGateway } from "@test/fake-linear/gateway/memory"
import { describe, expect, test } from "bun:test"
import { Effect, Stream } from "effect"

import type { LinearGatewayShape } from "@/linear/gateway"

import { LinearNetworkError } from "@/linear/errors"

const readFailureMessage = "The socket closed."

const failWorkingRead = (gateway: LinearGatewayShape): LinearGatewayShape => ({
  ...gateway,
  issue: {
    ...gateway.issue,
    workingSet: (refs, options) =>
      options.mode === "working"
        ? Effect.fail(new LinearNetworkError({ message: readFailureMessage }))
        : gateway.issue.workingSet(refs, options),
  },
})

const stdin = (value: unknown) =>
  Stream.make(new TextEncoder().encode(typeof value === "string" ? value : JSON.stringify(value)))

const run = async (
  seedValue: MemorySeed,
  gateway: LinearGatewayShape,
  args: readonly string[],
  input?: unknown,
) => {
  const lines: string[] = []
  const exit = await runIssueMemory(seedValue, args, lines, undefined, {
    gateway,
    ...(input === undefined ? {} : { stdio: { stdin: stdin(input) } }),
  })
  return { exit, lines }
}

const runApply = (
  seedValue: MemorySeed,
  gateway: LinearGatewayShape,
  document: unknown,
  args: readonly string[],
) => run(seedValue, gateway, ["apply", "RAT-1", "--file", "-", ...args], document)

const expectReadFailure = (warning: unknown) => {
  const text = String(warning)
  expect(text).toContain("The post-write read failed (network)")
  expect(text).toContain(readFailureMessage)
  expect(text).toContain("the issue is null")
}

describe("issue write output", () => {
  test("a failed post-write read after apply keeps the write result and returns a null issue", async () => {
    const seedValue = seed()
    const gateway = failWorkingRead(makeMemoryGateway(seedValue))
    const { exit, lines } = await runApply(seedValue, gateway, { title: "The map, updated" }, [
      "--format",
      "json",
    ])

    const output = lastJsonRecord(lines)
    expect(exit.code).toBe(0)
    expect(output.result).toMatchObject({ action: "apply", status: "updated" })
    expect(output.issue).toBeNull()
    expectReadFailure(output.warning)
  })

  test("a failed post-write read after relate keeps the write result", async () => {
    const seedValue = seed()
    const gateway = failWorkingRead(makeMemoryGateway(seedValue))
    const { exit, lines } = await run(seedValue, gateway, [
      "relate",
      "RAT-1",
      "--related",
      "RAT-3",
      "--format",
      "json",
    ])

    const output = lastJsonRecord(lines)
    expect(exit.code).toBe(0)
    expect(output.result).toMatchObject({ action: "relate", status: "updated" })
    expect(output.issue).toBeNull()
    expectReadFailure(output.warning)
  })

  test("apply returns the current issue after a successful post-write read", async () => {
    const seedValue = seed()
    const gateway = makeMemoryGateway(seedValue)
    const { exit, lines } = await runApply(
      seedValue,
      gateway,
      { title: "The map, updated", state: "Done" },
      ["--format", "json"],
    )

    const output = lastJsonRecord(lines)
    expect(exit.code).toBe(0)
    expect(output.issue).toMatchObject({
      identifier: "RAT-1",
      title: "The map, updated",
      state: { name: "Done", type: "completed" },
    })
    expect(output.warning).toBeNull()
  })

  test("relate returns the current issue after a successful post-write read", async () => {
    const seedValue = seed()
    const gateway = makeMemoryGateway(seedValue)
    const { exit, lines } = await run(seedValue, gateway, [
      "relate",
      "RAT-1",
      "--related",
      "RAT-3",
      "--format",
      "json",
    ])

    const output = lastJsonRecord(lines)
    expect(exit.code).toBe(0)
    expect(output.issue).toMatchObject({
      identifier: "RAT-1",
      title: "The map",
      state: { name: "In Progress", type: "started" },
    })
    expect(output.warning).toBeNull()
  })

  test("start returns the current issue after a successful post-write read", async () => {
    const issue = makeIssue({ identifier: "RAT-30", title: "Start me" })
    const seedValue = seed({ issues: [issue] })
    const gateway = makeMemoryGateway(seedValue)
    const { exit, lines } = await run(seedValue, gateway, ["start", "RAT-30", "--format", "json"])

    const output = lastJsonRecord(lines)
    expect(exit.code).toBe(0)
    expect(output.issue).toMatchObject({
      identifier: "RAT-30",
      state: { name: "In Progress", type: "started" },
      assignee: { id: viewer.id },
    })
    expect(output.warning).toBeNull()
  })

  test("handoff returns the current issue after a successful post-write read", async () => {
    const prUrl = "https://github.com/acme/rata/pull/58"
    const issue = makeIssue({
      identifier: "RAT-50",
      title: "Handoff",
      description: "## Handoff\nOld.",
    })
    const seedValue = seed({ issues: [issue] })
    const gateway = makeMemoryGateway(seedValue)
    const { exit, lines } = await run(
      seedValue,
      gateway,
      ["handoff", "RAT-50", "--file", "-", "--format", "json"],
      {
        pr: prUrl,
        state: "Done",
        sections: [{ heading: "Handoff", mode: "replace", content: "PR #58." }],
        comment: { body: "Handoff is ready.", dedupeKey: "handoff-58" },
      },
    )

    const output = lastJsonRecord(lines)
    expect(exit.code).toBe(0)
    expect(output.issue).toMatchObject({
      identifier: "RAT-50",
      state: { name: "Done", type: "completed" },
      prs: [expect.objectContaining({ url: prUrl })],
    })
    expect(output.warning).toBeNull()
  })

  test("close returns the current issue after a successful post-write read", async () => {
    const issue = makeIssue({ identifier: "RAT-42", title: "Close me" })
    const seedValue = seed({ issues: [issue] })
    const gateway = makeMemoryGateway(seedValue)
    const { exit, lines } = await run(seedValue, gateway, ["close", "RAT-42", "--format", "json"])

    const output = lastJsonRecord(lines)
    expect(exit.code).toBe(0)
    expect(output.issue).toMatchObject({
      identifier: "RAT-42",
      state: { name: "Done", type: "completed" },
    })
    expect(output.warning).toBeNull()
  })

  test("comment returns the current issue after a successful post-write read", async () => {
    const seedValue = seed()
    const gateway = makeMemoryGateway(seedValue)
    const { exit, lines } = await run(
      seedValue,
      gateway,
      ["comment", "RAT-1", "--body-file", "-", "--dedupe-key", "note-1", "--format", "json"],
      "A note.",
    )

    const output = lastJsonRecord(lines)
    expect(exit.code).toBe(0)
    expect(output.issue).toMatchObject({
      identifier: "RAT-1",
      title: "The map",
      state: { name: "In Progress", type: "started" },
    })
    expect(output.warning).toBeNull()
  })

  test("a dry run with a failed post-write read keeps its result and returns a null issue", async () => {
    const seedValue = seed()
    const gateway = failWorkingRead(makeMemoryGateway(seedValue))
    const { exit, lines } = await runApply(seedValue, gateway, { title: "The map, updated" }, [
      "--dry-run",
      "--format",
      "json",
    ])

    const output = lastJsonRecord(lines)
    expect(exit.code).toBe(0)
    expect(output.result).toMatchObject({ status: "updated", dryRun: true })
    expect(output.issue).toBeNull()
    expectReadFailure(output.warning)
  })

  test("a failed post-write read prints no issue block and one warning line", async () => {
    const seedValue = seed()
    const gateway = failWorkingRead(makeMemoryGateway(seedValue))
    const { exit, lines } = await runApply(seedValue, gateway, { title: "The map, updated" }, [])

    expect(exit.code).toBe(0)
    expect(lines.some((line) => line.startsWith("RAT-1:"))).toBe(false)
    expect(lines.filter((line) => line.startsWith("warning: "))).toHaveLength(1)
  })
})
